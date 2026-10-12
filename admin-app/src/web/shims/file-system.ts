/**
 * Browser stand-in for `expo-file-system`.
 *
 * The services write reports, receipts and backup files through the Expo
 * `File` / `Directory` API, then hand the URI to the share sheet. In the
 * browser those files live in memory for the length of the page load: the
 * share shim turns them into a download, and the document-picker shim places
 * picked files here so the backup reader can stream them exactly as it does
 * on a phone. Nothing here persists; durable data lives in online storage.
 */

const files = new Map<string, Uint8Array>();
const modified = new Map<string, number>();
const dirs = new Set<string>(["file:///document", "file:///cache"]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type PathPart = string | { uri: string };

const trimEnd = (uri: string) => uri.replace(/\/+$/, "");

function join(parts: PathPart[]): string {
  return trimEnd(
    parts
      .map((part, index) => {
        const value = typeof part === "string" ? part : part.uri;
        return index === 0 ? trimEnd(value) : value.replace(/^\/+/, "");
      })
      .filter(Boolean)
      .join("/")
  );
}

function put(uri: string, bytes: Uint8Array): void {
  files.set(uri, bytes);
  modified.set(uri, Date.now());
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Places bytes at a URI, for the shims that produce files (picker, print). */
export function writeVirtualFile(uri: string, bytes: Uint8Array): void {
  put(uri, bytes);
}

/** Bytes stored at a URI, or null. Used by the share shim. */
export function readVirtualFile(uri: string): Uint8Array | null {
  return files.get(uri) ?? null;
}

export class File {
  readonly uri: string;

  constructor(...parts: PathPart[]) {
    this.uri = join(parts);
  }

  get name(): string {
    return this.uri.split("/").pop() ?? "";
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  get size(): number | null {
    return files.get(this.uri)?.length ?? null;
  }

  create(_options?: { overwrite?: boolean; intermediates?: boolean }): this {
    put(this.uri, new Uint8Array(0));
    return this;
  }

  delete(): void {
    if (!files.has(this.uri)) throw new Error(`No file at ${this.uri}`);
    files.delete(this.uri);
    modified.delete(this.uri);
  }

  write(content: string | Uint8Array, options?: { encoding?: "utf8" | "base64" }): void {
    if (content instanceof Uint8Array) put(this.uri, content);
    else if (options?.encoding === "base64") put(this.uri, base64ToBytes(content));
    else put(this.uri, encoder.encode(content));
  }

  async text(): Promise<string> {
    return decoder.decode(this.require());
  }

  async base64(): Promise<string> {
    return bytesToBase64(this.require());
  }

  async bytes(): Promise<Uint8Array> {
    return this.require();
  }

  copy(destination: File | Directory): void {
    const target = destination instanceof Directory ? new File(destination, this.name) : destination;
    put(target.uri, new Uint8Array(this.require()));
  }

  info(): { exists: boolean; uri: string; size: number | null; modificationTime: number | null } {
    return {
      exists: this.exists,
      uri: this.uri,
      size: this.size,
      modificationTime: modified.get(this.uri) ?? null,
    };
  }

  /** A streaming handle, matching the native FileHandle the backup code uses. */
  open() {
    const uri = this.uri;
    if (!files.has(uri)) put(uri, new Uint8Array(0));
    // Writes are collected and joined on close: appending to a typed array one
    // chunk at a time would copy the whole file on every write.
    const pendingWrites: Uint8Array[] = [];
    let offset = 0;
    let closed = false;

    const flush = () => {
      if (pendingWrites.length === 0) return;
      const current = files.get(uri) ?? new Uint8Array(0);
      const extra = pendingWrites.reduce((sum, chunk) => sum + chunk.length, 0);
      const next = new Uint8Array(current.length + extra);
      next.set(current);
      let at = current.length;
      for (const chunk of pendingWrites) {
        next.set(chunk, at);
        at += chunk.length;
      }
      pendingWrites.length = 0;
      put(uri, next);
    };

    return {
      get offset() {
        return offset;
      },
      set offset(value: number) {
        offset = value;
      },
      get size() {
        flush();
        return files.get(uri)?.length ?? 0;
      },
      writeBytes(bytes: Uint8Array) {
        if (closed) throw new Error("The file handle is closed.");
        pendingWrites.push(new Uint8Array(bytes));
        offset += bytes.length;
      },
      readBytes(length: number): Uint8Array {
        if (closed) throw new Error("The file handle is closed.");
        flush();
        const current = files.get(uri) ?? new Uint8Array(0);
        const slice = current.subarray(offset, Math.min(offset + length, current.length));
        offset += slice.length;
        return slice;
      },
      close() {
        flush();
        closed = true;
      },
    };
  }

  private require(): Uint8Array {
    const bytes = files.get(this.uri);
    if (!bytes) throw new Error(`No file at ${this.uri}`);
    return bytes;
  }
}

export class Directory {
  readonly uri: string;

  constructor(...parts: PathPart[]) {
    this.uri = join(parts);
  }

  get name(): string {
    return this.uri.split("/").pop() ?? "";
  }

  get exists(): boolean {
    return dirs.has(this.uri);
  }

  get size(): number {
    let total = 0;
    for (const [uri, bytes] of files) if (uri.startsWith(`${this.uri}/`)) total += bytes.length;
    return total;
  }

  create(_options?: { intermediates?: boolean; idempotent?: boolean }): this {
    dirs.add(this.uri);
    return this;
  }

  delete(): void {
    for (const uri of [...files.keys()]) {
      if (uri.startsWith(`${this.uri}/`)) {
        files.delete(uri);
        modified.delete(uri);
      }
    }
    dirs.delete(this.uri);
  }

  list(): File[] {
    return [...files.keys()]
      .filter((uri) => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes("/"))
      .map((uri) => new File(uri));
  }
}

export const Paths = {
  get document(): Directory {
    return new Directory("file:///document");
  },
  get cache(): Directory {
    return new Directory("file:///cache");
  },
};
