/**
 * The claude.ai artifact runtime, as the app sees it.
 *
 * `window.claude.use(name)` resolves a capability namespace, or null when
 * this view cannot run it. Each namespace is resolved once and memoised.
 * Outside an artifact (a local preview) there is no runtime at all, which is
 * treated as every capability being unavailable.
 *
 * The shapes below are the parts of the platform's own type definitions this
 * app calls; the platform's definitions are authoritative.
 */

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}

export interface QuerySnapshot {
  docs: DocSnapshot[];
  size: number;
  empty: boolean;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}

export interface DbError {
  code: string;
  message: string;
}

export interface DocRef {
  id: string;
  path: string;
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  acquire(options: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean; expiresAt?: string }>;
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: DbError) => void): () => void;
  collection(path: string): CollectionRef;
}

export interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, dir?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnapshot>;
  onSnapshot(next: (snap: QuerySnapshot) => void, error?: (e: DbError) => void): () => void;
}

export interface CollectionRef extends Query {
  path: string;
  doc(id?: string): DocRef;
}

export interface Db {
  doc(path: string): DocRef;
  collection(path: string): CollectionRef;
}

export interface UserNs {
  isOwner(): Promise<boolean>;
  canEdit(): Promise<boolean>;
  can(name: string): Promise<boolean | null>;
  id(): Promise<string | null>;
  profiles(ids: readonly string[]): Promise<Record<string, { id: string; name: string; isMe: boolean }>>;
}

export interface AssetsNs {
  upload(
    blob: Blob,
    options?: { type?: string }
  ): Promise<{ id: string; url: string; sizeBytes: number; contentType: string }>;
  list(): Promise<{
    assets: { id: string; url: string; contentType: string; sizeBytes: number; createdAt: string }[];
    usage: { files: number; bytes: number; maxFiles: number; maxBytes: number };
  }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
}

export interface DownloadsNs {
  save(request: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<unknown>;
}

interface CapabilityMap {
  db: Db;
  user: UserNs;
  assets: AssetsNs;
  downloads: DownloadsNs;
}

type Use = (name: string) => Promise<unknown>;

function runtime(): { use: Use } | null {
  const claude = (globalThis as { claude?: { use?: Use } }).claude;
  return claude && typeof claude.use === "function" ? (claude as { use: Use }) : null;
}

const resolved = new Map<keyof CapabilityMap, Promise<unknown>>();

/** The namespace for `name`, or null when this view cannot run it. */
export function capability<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null> {
  let pending = resolved.get(name);
  if (!pending) {
    const claude = runtime();
    pending = claude
      ? claude.use(name).then(
          (value) => value ?? null,
          () => null
        )
      : Promise.resolve(null);
    resolved.set(name, pending);
  }
  return pending as Promise<CapabilityMap[K] | null>;
}

export function hasRuntime(): boolean {
  return runtime() !== null;
}

/** Turns a platform rejection (`{code, message}`) into readable text. */
export function describeError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const { code, message } = error as { code: string; message?: string };
    if (code === "quota_exceeded") {
      return "The hostel's storage is full. Delete old records or snapshots, then try again.";
    }
    if (code === "resource_exhausted" || code === "rate_limited") {
      return "Too many changes at once. Wait a few seconds and try again.";
    }
    if (code === "unavailable" || code === "store_unavailable") {
      return "The connection to Claude storage dropped. Check your internet and try again.";
    }
    if (code === "revoked" || code === "not_granted") {
      return "This account no longer has access to the hostel records.";
    }
    return message || code;
  }
  return error instanceof Error ? error.message : String(error);
}
