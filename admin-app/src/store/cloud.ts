/**
 * The hostel's records in online storage.
 *
 * Every collection is subscribed to once when the app opens. Each snapshot
 * replaces that collection's in-memory copy, so reads are synchronous and
 * always reflect the latest state -- including changes other people make on
 * other devices, which arrive live. Services read from here and write
 * through here; nothing else talks to the database.
 *
 * online storage has no transactions and no joins. The services compute
 * joins and totals in memory, as SQLite used to, and the few writes that
 * must not race (a bed being taken, an admission number being issued, a
 * payment against a bill) run inside `withLock`, a short cooperative lease
 * on the document being changed, reading the server's current copy before
 * writing.
 */
import { capability, describeError, type Db, type DocRef, type Query } from "@/web/runtime";

export type CollectionName =
  | "branches"
  | "rooms"
  | "inmates"
  | "fees"
  | "templates"
  | "messages"
  | "notices"
  | "complaints"
  | "config"
  | "counters"
  | "snapshots"
  | "activity";

export type DocData = Record<string, unknown>;

const SUBSCRIBED: CollectionName[] = [
  "branches",
  "rooms",
  "inmates",
  "fees",
  "templates",
  "messages",
  "notices",
  "complaints",
  "config",
  "counters",
  "snapshots",
];

/** How many days of the activity feed the admin panel keeps live. */
export const ACTIVITY_DAYS = 14;

const collections = new Map<CollectionName, Map<string, DocData>>();
const listeners = new Set<() => void>();
let version = 0;
let notifyScheduled = false;

let db: Db | null = null;
let opening: Promise<void> | null = null;
let userId: string | null = null;
let writable: boolean | null = null;
/**
 * The one branch this login is limited to, or null for the admin. The server
 * refuses a manager anything outside their branch, so every query a manager
 * makes names it.
 */
let scopeBranch: string | null = null;

/** Collections whose records belong to a branch (`branchId` on each). */
const BRANCH_SCOPED: CollectionName[] = ["rooms", "inmates", "fees", "messages", "complaints", "counters", "activity"];
/** Admin-only collections a manager never subscribes to. */
const ADMIN_ONLY: CollectionName[] = ["snapshots"];
let connectionProblem: string | null = null;
/** Stops for every live subscription, so logging out closes them. */
let unsubscribers: (() => void)[] = [];
/** Bumped on close, so a late reconnect from an old login does nothing. */
let generation = 0;

export const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

// --- change notification ---------------------------------------------------

function changed(): void {
  version += 1;
  if (notifyScheduled) return;
  notifyScheduled = true;
  // Coalesces a burst of snapshots (one per collection on open, or a batch of
  // writes) into a single refresh of the screens.
  setTimeout(() => {
    notifyScheduled = false;
    listeners.forEach((listener) => listener());
  }, 0);
}

/** Called after any change, local or remote. Returns an unsubscribe. */
export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Increases on every change; derived views cache against it. */
export function storeVersion(): number {
  return version;
}

/** A message for the person when live updates have stopped, else null. */
export function storeProblem(): string | null {
  return connectionProblem;
}

// --- opening ----------------------------------------------------------------

function requireDb(): Db {
  if (!db) throw new Error("The hostel records are not open yet.");
  return db;
}

/** The queries that together make up what this login may see of a collection. */
function queriesFor(name: CollectionName): Query[] {
  const base = requireDb().collection(name);
  if (!scopeBranch) {
    return [name === "activity" ? base.where("day", ">=", activityCutoff()) : base];
  }
  if (ADMIN_ONLY.includes(name)) return [];
  if (name === "activity") {
    return [base.where("branchId", "==", scopeBranch).where("day", ">=", activityCutoff())];
  }
  if (BRANCH_SCOPED.includes(name)) return [base.where("branchId", "==", scopeBranch)];
  // Notices: the manager's own branch, plus those shared with every branch.
  if (name === "notices") return [base.where("branchId", "==", scopeBranch), base.where("branchId", "==", null)];
  return [base];
}

function subscribe(name: CollectionName, onFirst: () => void, onFail: (error: unknown) => void): void {
  const queries = queriesFor(name);
  const parts: (Map<string, DocData> | null)[] = queries.map(() => null);
  let failed = false;

  if (queries.length === 0) {
    collections.set(name, new Map());
    onFirst();
    return;
  }

  const openedIn = generation;
  queries.forEach((ref, index) => {
    const stop = ref.onSnapshot(
      (snap) => {
        const firstDelivery = parts.some((part) => part === null);
        const map = new Map<string, DocData>();
        for (const doc of snap.docs) {
          const body = doc.data();
          if (body) map.set(doc.id, body);
        }
        parts[index] = map;
        if (parts.some((part) => part === null)) return;
        const merged = new Map<string, DocData>();
        for (const part of parts) for (const [id, body] of part as Map<string, DocData>) merged.set(id, body);
        collections.set(name, merged);
        if (connectionProblem) connectionProblem = null;
        changed();
        if (firstDelivery) onFirst();
      },
      (error) => {
        if (parts.some((part) => part === null)) {
          if (!failed) {
            failed = true;
            onFail(error);
          }
          return;
        }
        connectionProblem = describeError(error);
        changed();
        // A dropped connection recovers only through a fresh subscription.
        if (error.code === "unavailable") {
          setTimeout(() => {
            if (openedIn === generation) subscribe(name, () => undefined, () => undefined);
          }, 3000);
        }
      }
    );
    unsubscribers.push(stop);
  });
}

/**
 * Closes the records: stops every live subscription and forgets what was
 * loaded. Called on log-out, so the next login starts clean and never sees
 * the previous person's data.
 */
export function closeStore(): void {
  generation += 1;
  for (const stop of unsubscribers) {
    try {
      stop();
    } catch {
      // Already stopped.
    }
  }
  unsubscribers = [];
  collections.clear();
  writeQueues.clear();
  opening = null;
  db = null;
  userId = null;
  writable = null;
  scopeBranch = null;
  connectionProblem = null;
  changed();
}

/**
 * Opens the records: resolves once every collection has delivered its first
 * snapshot. Safe to call repeatedly; later calls share the first.
 */
export function openStore(): Promise<void> {
  if (!opening) {
    opening = (async () => {
      db = await capability("db");
      if (!db) {
        throw new Error(
          "online storage is not available here. Open the hostel app from claude.ai while signed in."
        );
      }
      const user = await capability("user");
      userId = user ? await user.id() : null;
      writable = user ? await user.can("data.write") : null;
      scopeBranch = user?.branchId ? await user.branchId() : null;

      await Promise.all(
        [...SUBSCRIBED, "activity" as const].map(
          (name) =>
            new Promise<void>((resolve, reject) =>
              subscribe(name, resolve, (error) => reject(new Error(describeError(error))))
            )
        )
      );
    })();
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

/** The signed-in person's id, as online storage knows them. */
export function currentUserId(): string | null {
  return userId;
}

/** The branch this login is limited to; null for the admin. */
export function limitedToBranch(): string | null {
  return scopeBranch;
}

/** False when this person can only view the records; null when not told. */
export function canWriteRecords(): boolean | null {
  return writable;
}

// --- reading ----------------------------------------------------------------

export function list<T>(name: CollectionName): T[] {
  return [...(collections.get(name)?.values() ?? [])] as T[];
}

/** Documents with their ids, for collections whose ids carry meaning. */
export function entries<T>(name: CollectionName): [string, T][] {
  return [...(collections.get(name)?.entries() ?? [])] as [string, T][];
}

export function find<T>(name: CollectionName, id: string | null | undefined): T | null {
  if (!id) return null;
  return (collections.get(name)?.get(id) as T | undefined) ?? null;
}

export function count(name: CollectionName): number {
  return collections.get(name)?.size ?? 0;
}

/** The server's current copy, bypassing the live cache. Use inside locks. */
export async function fresh<T>(name: CollectionName, id: string): Promise<T | null> {
  const snap = await requireDb().collection(name).doc(id).get();
  return snap.exists ? (snap.data() as T) : null;
}

/** The server's current matches for one equality filter. */
export async function freshWhere<T>(name: CollectionName, field: string, value: unknown): Promise<T[]> {
  let ref = requireDb().collection(name).where(field, "==", value);
  if (scopeBranch && BRANCH_SCOPED.includes(name) && field !== "branchId") {
    ref = ref.where("branchId", "==", scopeBranch);
  }
  const snap = await ref.get();
  return snap.docs.map((doc) => doc.data() as T);
}

// --- writing ----------------------------------------------------------------

/** Writes to one document must not overlap; each waits for the last. */
const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  writeQueues.set(path, next);
  // The caller handles a failed write; this tidy-up must not raise it again.
  next
    .finally(() => {
      if (writeQueues.get(path) === next) writeQueues.delete(path);
    })
    .catch(() => undefined);
  return next;
}

function writeError(error: unknown): Error {
  if (
    writable === false ||
    (error && typeof error === "object" && (error as { code?: string }).code === "invalid_argument" && writable === null)
  ) {
    return new Error("This account can view the hostel records but not change them.");
  }
  return new Error(describeError(error));
}

function local(name: CollectionName): Map<string, DocData> {
  let map = collections.get(name);
  if (!map) {
    map = new Map();
    collections.set(name, map);
  }
  return map;
}

function stripUndefined<T>(value: T): T {
  // JSON has no `undefined`; the store would reject or drop it inconsistently.
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge(base: DocData, patch: DocData): DocData {
  const out: DocData = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (
      value && typeof value === "object" && !Array.isArray(value) &&
      current && typeof current === "object" && !Array.isArray(current)
    ) {
      out[key] = deepMerge(current as DocData, value as DocData);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Replaces a whole document (creating it if needed). */
export function put(name: CollectionName, id: string, data: DocData): Promise<void> {
  const body = stripUndefined(data);
  return enqueue(`${name}/${id}`, async () => {
    try {
      await requireDb().collection(name).doc(id).set(body);
    } catch (error) {
      throw writeError(error);
    }
    local(name).set(id, body);
    changed();
  });
}

/**
 * Merges fields into an existing document. Nested objects merge, so two
 * people changing different entries of one map never overwrite each other.
 */
export function patch(name: CollectionName, id: string, data: DocData): Promise<void> {
  const body = stripUndefined(data);
  return enqueue(`${name}/${id}`, async () => {
    try {
      await requireDb().collection(name).doc(id).update(body);
    } catch (error) {
      throw writeError(error);
    }
    const map = local(name);
    map.set(id, deepMerge(map.get(id) ?? {}, body));
    changed();
  });
}

export function remove(name: CollectionName, id: string): Promise<void> {
  return enqueue(`${name}/${id}`, async () => {
    try {
      await requireDb().collection(name).doc(id).delete();
    } catch (error) {
      throw writeError(error);
    }
    local(name).delete(id);
    changed();
  });
}

// --- locks ------------------------------------------------------------------

/** Long enough for a read and a write; short enough not to stall others. */
const LOCK_TTL_MS = 4000;
const LOCK_ATTEMPTS = 12;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` while holding a short lease on one document, so another device
 * doing the same thing waits its turn instead of racing. Inside, read with
 * `fresh()`, never the cache. Leases are cooperative: every writer of the
 * guarded documents goes through this.
 */
export async function withLock<T>(name: CollectionName, id: string, task: () => Promise<T>): Promise<T> {
  const ref: DocRef = requireDb().collection(name).doc(id);
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    let acquired = false;
    try {
      acquired = (await ref.acquire({ holder: sessionId, ttlMs: LOCK_TTL_MS })).acquired;
    } catch (error) {
      throw writeError(error);
    }
    if (acquired) return task();
    await sleep(250 + Math.random() * 350);
  }
  throw new Error("Someone else is changing this record right now. Try again in a moment.");
}

// --- activity feed ------------------------------------------------------------

export type ActivityAction = "created" | "updated" | "deleted" | "payment" | "reversed" | "imported";

export interface ActivityEvent {
  id: string;
  at: number;
  /** online storage id of the person who made the change. */
  by: string | null;
  action: ActivityAction;
  entity: "inmate" | "room" | "bill" | "payment" | "notice" | "complaint" | "template" | "message" | "branch" | "settings" | "backup";
  entityId: string;
  /** What the change was about, e.g. an inmate's name. */
  label: string;
  branchId: string | null;
}

function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function activityCutoff(): string {
  return dayKey(new Date(Date.now() - ACTIVITY_DAYS * 86_400_000));
}

/**
 * Records a change for the admin panel's live activity feed.
 *
 * One document per day holds that day's events as a map, so the feed costs a
 * handful of documents rather than one per change. Best-effort: a failure
 * here never fails the change it describes.
 */
export function logActivity(event: Omit<ActivityEvent, "id" | "at" | "by">): void {
  const entry: ActivityEvent = {
    ...event,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()),
    at: Date.now(),
    by: userId,
  };
  // One document per day per branch, so a manager's feed (and the server's
  // check on it) covers their own hostel only. Changes with no branch of
  // their own are filed under the branch of whoever made them.
  const day = dayKey();
  const branchId = event.branchId ?? scopeBranch ?? null;
  const docId = `${day}_${branchId ?? "all"}`;
  const exists = local("activity").has(docId);
  const write = exists
    ? patch("activity", docId, { events: { [entry.id]: entry } })
    : put("activity", docId, { day, branchId, events: { [entry.id]: entry } });
  write.catch(() => {
    // The day's document may have been created elsewhere a moment ago.
    if (!exists) patch("activity", docId, { events: { [entry.id]: entry } }).catch(() => undefined);
  });
}

export function recentActivity(): ActivityEvent[] {
  return list<{ events?: Record<string, ActivityEvent> }>("activity")
    .flatMap((doc) => Object.values(doc.events ?? {}))
    .sort((a, b) => b.at - a.at);
}

// --- bulk work ----------------------------------------------------------------

/** Runs writes a few at a time, so a large import stays under rate limits. */
export async function runThrottled<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  onProgress?: (done: number) => void,
  concurrency = 3
): Promise<void> {
  let next = 0;
  let done = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      let attempt = 0;
      for (;;) {
        try {
          await worker(items[index], index);
          break;
        } catch (error) {
          attempt += 1;
          const message = error instanceof Error ? error.message : "";
          // Back off on rate limits and transient drops; anything else is real.
          if (attempt >= 4 || !/Too many changes|connection to the server/.test(message)) throw error;
          await sleep(800 * attempt);
        }
      }
      done += 1;
      onProgress?.(done);
    }
  });
  await Promise.all(lanes);
}
