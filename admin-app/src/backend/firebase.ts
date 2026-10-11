/**
 * Firebase as the app's backend.
 *
 * Records live in Firestore, logins in Firebase Authentication. This module
 * presents them through the same small interfaces the store already reads
 * and writes through (see src/web/runtime.ts), so the services above do not
 * know or care which backend they are on.
 *
 * Who may see what is decided by the server (firestore.rules), from each
 * login's `staff/<uid>` document: the admin sees both hostels, a manager
 * only their own branch.
 */
import { Platform } from "react-native";
import { FirebaseApp, FirebaseOptions, initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import {
  Auth,
  User,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  CollectionReference,
  DocumentData,
  FieldPath,
  Firestore,
  Query as FirestoreQuery,
  QueryConstraint,
  WhereFilterOp,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit as limitTo,
  onSnapshot,
  orderBy as orderByField,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  FirebaseStorage,
  connectStorageEmulator,
  deleteObject,
  getDownloadURL,
  getMetadata,
  getStorage,
  listAll,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";

import type {
  AssetsNs,
  CollectionRef,
  Db,
  DbError,
  DocRef,
  DocSnapshot,
  DownloadsNs,
  Query,
  QuerySnapshot,
  UserNs,
} from "@/web/runtime";

export type StaffRole = "admin" | "manager";

/** One login, as recorded in `staff/<uid>`. Written only by the server. */
export interface StaffRecord {
  uid: string;
  /** What the person types to log in, e.g. `thammanam`. */
  username: string;
  name: string;
  role: StaffRole;
  /** The manager's hostel; null for the admin, who has both. */
  branchId: string | null;
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BackendOptions {
  config: FirebaseOptions;
  /** Host of the local Firebase emulators, for development and tests. */
  emulatorHost?: string;
  /** Distinct name when more than one app instance lives in a process. */
  appName?: string;
}

/**
 * Logins are a user id and password chosen by the admin. Firebase signs
 * people in by email, so the id is carried in a fixed, never-emailed address.
 */
const LOGIN_DOMAIN = "staff.royalhostel.app";

export function loginEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
}

function toDbError(error: unknown): DbError {
  const code = (error as { code?: string })?.code ?? "";
  const message = (error as { message?: string })?.message ?? String(error);
  if (code.includes("permission-denied")) return { code: "permission_denied", message };
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return { code: "unavailable", message };
  if (code.includes("resource-exhausted")) return { code: "resource_exhausted", message };
  if (code.includes("not-found")) return { code: "invalid_argument", message };
  return { code: "invalid_argument", message };
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toDbError(error);
  }
}

/**
 * Turns a nested patch into leaf field paths, so an update merges into nested
 * maps (one payment into one bill) instead of replacing them. Empty objects
 * change nothing; arrays are replaced whole.
 */
function leaves(data: Record<string, unknown>, prefix: string[] = []): [FieldPath, unknown][] {
  const out: [FieldPath, unknown][] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...leaves(value as Record<string, unknown>, [...prefix, key]));
    } else {
      out.push([new FieldPath(...prefix, key), value]);
    }
  }
  return out;
}

function makeDb(firestore: Firestore): Db {
  const snapOf = (id: string, exists: boolean, data: DocumentData | undefined, meta: { fromCache: boolean; hasPendingWrites: boolean }): DocSnapshot => ({
    id,
    exists,
    data: () => (exists ? (data as Record<string, unknown>) : undefined),
    metadata: meta,
  });

  const querySnap = (snap: { docs: { id: string; data(): DocumentData }[]; metadata: { fromCache: boolean; hasPendingWrites: boolean } }): QuerySnapshot => {
    const docs = snap.docs.map((d) => snapOf(d.id, true, d.data(), snap.metadata));
    return { docs, size: docs.length, empty: docs.length === 0, metadata: snap.metadata };
  };

  function makeQuery(base: CollectionReference, constraints: QueryConstraint[]): Query {
    const built = (): FirestoreQuery => (constraints.length ? query(base, ...constraints) : base);
    return {
      where: (field, op, value) => makeQuery(base, [...constraints, where(field, op as WhereFilterOp, value)]),
      orderBy: (field, dir) => makeQuery(base, [...constraints, orderByField(field, dir)]),
      limit: (n) => makeQuery(base, [...constraints, limitTo(n)]),
      get: () => guarded(async () => querySnap(await getDocs(built()))),
      onSnapshot: (next, error) =>
        onSnapshot(
          built(),
          (snap) => next(querySnap(snap)),
          (e) => error?.(toDbError(e))
        ),
    };
  }

  function docRef(path: string): DocRef {
    const ref = doc(firestore, path);
    return {
      id: ref.id,
      path,
      get: () =>
        guarded(async () => {
          const snap = await getDoc(ref);
          return snapOf(snap.id, snap.exists(), snap.data(), snap.metadata);
        }),
      set: (data) => guarded(() => setDoc(ref, data)),
      update: (data) =>
        guarded(async () => {
          const pairs = leaves(data);
          if (pairs.length === 0) return;
          const [[firstPath, firstValue], ...rest] = pairs;
          await updateDoc(ref, firstPath, firstValue, ...rest.flat());
        }),
      delete: () => guarded(() => deleteDoc(ref)),
      /**
       * A short lease, taken in a transaction on `locks/<collection>__<id>`,
       * so two devices changing the same record take turns.
       */
      acquire: ({ holder, ttlMs }) =>
        guarded(async () => {
          const lockRef = doc(firestore, "locks", path.replace(/\//g, "__"));
          const ttl = Math.min(Math.max(ttlMs ?? 30_000, 1_000), 600_000);
          return runTransaction(firestore, async (txn) => {
            const now = Date.now();
            const current = (await txn.get(lockRef)).data() as { holder?: string; expiresAt?: number } | undefined;
            if (current && current.holder !== holder && (current.expiresAt ?? 0) > now) {
              return { acquired: false, expiresAt: new Date(current.expiresAt ?? now).toISOString() };
            }
            txn.set(lockRef, { holder, expiresAt: now + ttl });
            return { acquired: true, expiresAt: new Date(now + ttl).toISOString() };
          });
        }),
      onSnapshot: (next, error) =>
        onSnapshot(
          ref,
          (snap) => next(snapOf(snap.id, snap.exists(), snap.data(), snap.metadata)),
          (e) => error?.(toDbError(e))
        ),
      collection: (sub) => collectionRef(`${path}/${sub}`),
    };
  }

  function collectionRef(path: string): CollectionRef {
    const base = collection(firestore, path);
    return Object.assign(makeQuery(base, []), {
      path,
      doc: (id?: string) => docRef(`${path}/${id ?? doc(base).id}`),
    });
  }

  return { doc: docRef, collection: collectionRef };
}

/**
 * Stored files. A file's id is its storage path with "/" written as "~"
 * (`photos~branch-thammanam~Ab3x.jpg`), so the id alone says where it is and
 * the server can check the branch in the path against the login.
 */
const idOf = (path: string) => path.split("/").join("~");
const pathOf = (id: string) => id.replace(/~/g, "/");
const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "text/plain": "txt" };

function makeAssets(storage: FirebaseStorage, firestore: Firestore, branchOfLogin: () => string | null): AssetsNs {
  /** The folders this login may look through: its own branch, or every branch. */
  async function folders(): Promise<string[]> {
    const own = branchOfLogin();
    if (own) return [`photos/${own}`];
    const branches = await getDocs(collection(firestore, "branches"));
    return [...branches.docs.map((d) => `photos/${d.id}`), "photos/shared", "snapshots"];
  }

  return {
    upload: (blob, options) =>
      guarded(async () => {
        const type = options?.type ?? blob.type ?? "application/octet-stream";
        const name = `${doc(collection(firestore, "_")).id}.${EXTENSION[type] ?? "bin"}`;
        const path = `${options?.folder ?? "files"}/${name}`;
        const target = storageRef(storage, path);
        await uploadBytes(target, blob, { contentType: type });
        return { id: idOf(path), url: await getDownloadURL(target), sizeBytes: blob.size, contentType: type };
      }),
    url: async (id) => {
      try {
        return await getDownloadURL(storageRef(storage, pathOf(id)));
      } catch {
        return null;
      }
    },
    list: () =>
      guarded(async () => {
        const assets: { id: string; url: string; contentType: string; sizeBytes: number; createdAt: string }[] = [];
        for (const folder of await folders()) {
          let items;
          try {
            items = (await listAll(storageRef(storage, folder))).items;
          } catch {
            continue;
          }
          const details = await Promise.all(items.map((item) => getMetadata(item).catch(() => null)));
          items.forEach((item, index) => {
            const meta = details[index];
            assets.push({
              id: idOf(item.fullPath),
              url: "",
              contentType: meta?.contentType ?? "",
              sizeBytes: meta?.size ?? 0,
              createdAt: meta?.timeCreated ?? "",
            });
          });
        }
        const bytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
        return { assets, usage: { files: assets.length, bytes, maxFiles: Number.MAX_SAFE_INTEGER, maxBytes: Number.MAX_SAFE_INTEGER } };
      }),
    delete: async (id) => {
      try {
        await deleteObject(storageRef(storage, pathOf(id)));
        return { deleted: true };
      } catch {
        return { deleted: false };
      }
    },
  };
}

/** Browser only: hands a generated file (report, receipt, backup) to the browser to save. */
function makeDownloads(): DownloadsNs | null {
  if (typeof document === "undefined") return null;
  return {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    },
  };
}

export interface Session {
  user: User;
  staff: StaffRecord;
}

export interface FirebaseBackend {
  /** Capability lookup, in the shape src/web/runtime.ts expects. */
  use(name: string): Promise<unknown>;
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
  /** Resolves once Firebase has restored (or ruled out) a saved login. */
  ready(): Promise<Session | null>;
  session(): Session | null;
  signIn(username: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  onSession(listener: (session: Session | null) => void): () => void;
  /** Asks the server to do something the app may not do itself (managing logins). */
  call<T = unknown>(name: string, data: Record<string, unknown>): Promise<T>;
  /** Changes the signed-in login's own password, after proving the current one. */
  changePassword(current: string, next: string): Promise<void>;
}

export class LoginError extends Error {}

/**
 * A phone keeps the login in its own storage, so the app opens signed in;
 * a browser does the same through the browser's storage.
 */
function makeAuth(app: FirebaseApp): Auth {
  if (Platform.OS === "web") return getAuth(app);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { initializeAuth, getReactNativePersistence } = require("firebase/auth");
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}

export function createFirebaseBackend(options: BackendOptions): FirebaseBackend {
  const app = initializeApp(options.config, options.appName ?? "[DEFAULT]");
  const auth = makeAuth(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  if (options.emulatorHost) {
    connectStorageEmulator(storage, options.emulatorHost, 9199);
    connectAuthEmulator(auth, `http://${options.emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, options.emulatorHost, 8080);
  }
  // Mumbai, where the server functions run.
  const functions = getFunctions(app, "asia-south1");
  if (options.emulatorHost) connectFunctionsEmulator(functions, options.emulatorHost, 5001);

  const db = makeDb(firestore);
  let current: Session | null = null;
  const listeners = new Set<(session: Session | null) => void>();
  const names = new Map<string, string>();

  async function loadSession(user: User | null): Promise<Session | null> {
    if (!user) return null;
    const snap = await getDoc(doc(firestore, "staff", user.uid));
    const staff = snap.data() as StaffRecord | undefined;
    if (!staff || staff.disabled) return null;
    names.set(user.uid, staff.name);
    return { user, staff: { ...staff, uid: user.uid } };
  }

  let resolveReady: (session: Session | null) => void;
  const whenReady = new Promise<Session | null>((resolve) => (resolveReady = resolve));
  /**
   * Watches the signed-in login's own record, so a manager the admin switches
   * off (or moves to the other hostel) is dropped back to the login screen
   * while their app is open, not only the next time they sign in.
   */
  let stopWatching: (() => void) | null = null;
  function watch(user: User | null): void {
    stopWatching?.();
    stopWatching = null;
    if (!user) return;
    stopWatching = onSnapshot(
      doc(firestore, "staff", user.uid),
      (snap) => {
        // Only what the server has confirmed counts: a local write the server
        // is about to refuse must not be mistaken for a real change.
        if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
        const staff = snap.data() as StaffRecord | undefined;
        const was = current;
        if (!was) return;
        if (!staff || staff.disabled || staff.role !== was.staff.role || staff.branchId !== was.staff.branchId) {
          current = null;
          listeners.forEach((listener) => listener(null));
          void firebaseSignOut(auth);
        } else {
          current = { user, staff: { ...staff, uid: user.uid } };
        }
      },
      () => undefined
    );
  }

  onAuthStateChanged(auth, async (user) => {
    try {
      current = await loadSession(user);
    } catch {
      current = null;
    }
    watch(current ? user : null);
    resolveReady(current);
    listeners.forEach((listener) => listener(current));
  });

  const user: UserNs = {
    isOwner: async () => current?.staff.role === "admin",
    canEdit: async () => current?.staff.role === "admin",
    can: async () => (current ? true : false),
    id: async () => current?.user.uid ?? null,
    branchId: async () => current?.staff.branchId ?? null,
    profiles: async (ids) => {
      const out: Record<string, { id: string; name: string; isMe: boolean }> = {};
      for (const id of ids) {
        if (!names.has(id)) {
          try {
            const snap = await getDoc(doc(firestore, "staff", id));
            names.set(id, (snap.data() as StaffRecord | undefined)?.name ?? "");
          } catch {
            // A manager cannot read other staff; the name simply stays blank.
            names.set(id, "");
          }
        }
        out[id] = { id, name: names.get(id) ?? "", isMe: id === current?.user.uid };
      }
      return out;
    },
  };

  const capabilities: Record<string, unknown> = {
    db,
    user,
    assets: makeAssets(storage, firestore, () => current?.staff.branchId ?? null),
    downloads: makeDownloads(),
  };

  return {
    use: async (name) => capabilities[name] ?? null,
    app,
    auth,
    firestore,
    storage,
    ready: () => whenReady,
    session: () => current,
    async call<T>(name: string, data: Record<string, unknown>): Promise<T> {
      try {
        const result = await httpsCallable(functions, name)(data);
        return result.data as T;
      } catch (error) {
        const { code = "", message = "" } = error as { code?: string; message?: string };
        if (code.includes("unavailable") || code.includes("internal") || code.includes("deadline")) {
          throw new Error("Could not reach the server. Check the internet connection and try again.");
        }
        // The server words its refusals for the person reading them.
        throw new Error(message || "That could not be done. Try again.");
      }
    },
    async changePassword(currentPassword: string, next: string): Promise<void> {
      const user = auth.currentUser;
      if (!user || !user.email) throw new LoginError("Log in again first.");
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        if (code.includes("network")) throw new LoginError("No internet connection. Check it and try again.");
        if (code.includes("too-many-requests")) throw new LoginError("Too many attempts. Wait a few minutes and try again.");
        throw new LoginError("The current password is not right.");
      }
      await updatePassword(user, next);
    },
    async signIn(username, password) {
      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, loginEmail(username), password);
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        if (code.includes("network")) throw new LoginError("No internet connection. Check it and try again.");
        if (code.includes("too-many-requests")) throw new LoginError("Too many attempts. Wait a few minutes and try again.");
        throw new LoginError("That user ID or password is not right.");
      }
      const session = await loadSession(credential.user);
      if (!session) {
        await firebaseSignOut(auth);
        throw new LoginError("This login has been switched off. Ask the admin.");
      }
      current = session;
      watch(credential.user);
      listeners.forEach((listener) => listener(current));
      return session;
    },
    async signOut() {
      stopWatching?.();
      stopWatching = null;
      current = null;
      await firebaseSignOut(auth);
    },
    onSession(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
