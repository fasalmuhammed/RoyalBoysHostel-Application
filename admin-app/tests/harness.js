/* Test harness: runs the real service code against an in-memory filesystem
   and a real SQLite engine (node:sqlite), with Expo native modules stubbed. */
const path = require("path");
const Module = require("module");
const nodeCrypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const BUILD = path.join(__dirname, "build");

// ---------------------------------------------------------------- in-memory fs
const files = new Map(); // uri -> Buffer
const dirs = new Set(["file:///doc", "file:///cache"]);

const norm = (u) => u.replace(/\/+$/, "");
function join(...parts) {
  return norm(
    parts
      .map((p, i) => (i === 0 ? norm(p) : String(p).replace(/^\/+/, "")))
      .filter(Boolean)
      .join("/")
  );
}
function uriOf(x) {
  if (typeof x === "string") return x;
  if (x && typeof x.uri === "string") return x.uri;
  throw new Error("bad uri part: " + x);
}

class FSFile {
  constructor(...parts) {
    this.uri = join(...parts.map(uriOf));
  }
  get name() {
    return this.uri.split("/").pop();
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.has(this.uri) ? files.get(this.uri).length : null;
  }
  get parentDirectory() {
    return new FSDirectory(this.uri.split("/").slice(0, -1).join("/"));
  }
  create() {
    files.set(this.uri, Buffer.alloc(0));
    return this;
  }
  delete() {
    if (!files.has(this.uri)) throw new Error("ENOENT " + this.uri);
    files.delete(this.uri);
  }
  write(content, options) {
    const enc = options && options.encoding;
    if (content instanceof Uint8Array) files.set(this.uri, Buffer.from(content));
    else if (enc === "base64") files.set(this.uri, Buffer.from(content, "base64"));
    else files.set(this.uri, Buffer.from(String(content), "utf8"));
  }
  async text() {
    return files.get(this.uri).toString("utf8");
  }
  async base64() {
    if (!files.has(this.uri)) throw new Error("ENOENT " + this.uri);
    return files.get(this.uri).toString("base64");
  }
  copy(dest) {
    const target = dest instanceof FSDirectory ? new FSFile(dest, this.name) : dest;
    files.set(target.uri, Buffer.from(files.get(this.uri)));
  }
  info() {
    return { exists: this.exists, uri: this.uri, size: this.size, modificationTime: Date.now() };
  }
  open() {
    const self = this;
    if (!files.has(this.uri)) files.set(this.uri, Buffer.alloc(0));
    let offset = 0;
    let closed = false;
    return {
      get offset() {
        return offset;
      },
      set offset(v) {
        offset = v;
      },
      get size() {
        return files.get(self.uri).length;
      },
      writeBytes(bytes) {
        if (closed) throw new Error("handle closed");
        const cur = files.get(self.uri);
        const incoming = Buffer.from(bytes);
        const end = offset + incoming.length;
        const next = Buffer.alloc(Math.max(cur.length, end));
        cur.copy(next);
        incoming.copy(next, offset);
        files.set(self.uri, next);
        offset = end;
      },
      readBytes(length) {
        if (closed) throw new Error("handle closed");
        const cur = files.get(self.uri);
        const slice = cur.subarray(offset, Math.min(offset + length, cur.length));
        offset += slice.length;
        return new Uint8Array(slice);
      },
      close() {
        closed = true;
      },
    };
  }
}

class FSDirectory {
  constructor(...parts) {
    this.uri = join(...parts.map(uriOf));
  }
  get name() {
    return this.uri.split("/").pop();
  }
  get exists() {
    return dirs.has(this.uri);
  }
  get size() {
    let total = 0;
    for (const [u, b] of files) if (u.startsWith(this.uri + "/")) total += b.length;
    return total;
  }
  create() {
    dirs.add(this.uri);
    return this;
  }
  delete() {
    for (const u of [...files.keys()]) if (u.startsWith(this.uri + "/")) files.delete(u);
    dirs.delete(this.uri);
  }
  list() {
    const out = [];
    const seen = new Set();
    for (const u of files.keys()) {
      if (!u.startsWith(this.uri + "/")) continue;
      const rest = u.slice(this.uri.length + 1);
      if (rest.includes("/")) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(new FSFile(u));
    }
    return out;
  }
  createFile(name) {
    return new FSFile(this, name).create();
  }
  createDirectory(name) {
    return new FSDirectory(this, name).create();
  }
}

const Paths = {
  get document() {
    return new FSDirectory("file:///doc");
  },
  get cache() {
    return new FSDirectory("file:///cache");
  },
};

// ---------------------------------------------------------------- sqlite shim
function makeDbApi(db) {
  const bind = (params) =>
    params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
  const flatten = (params) =>
    params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

  const api = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, ...params) {
      const st = db.prepare(sql);
      const r = st.run(...bind(flatten(params)));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync(sql, ...params) {
      return db.prepare(sql).all(...bind(flatten(params)));
    },
    async getFirstAsync(sql, ...params) {
      const rows = db.prepare(sql).all(...bind(flatten(params)));
      return rows.length ? rows[0] : null;
    },
    async withExclusiveTransactionAsync(task) {
      db.exec("BEGIN");
      try {
        await task(api);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async withTransactionAsync(task) {
      return api.withExclusiveTransactionAsync(task);
    },
    async closeAsync() {
      db.close();
    },
  };
  return api;
}

let sqliteInstances = new Map();
const expoSqlite = {
  async openDatabaseAsync(name) {
    if (!sqliteInstances.has(name)) {
      sqliteInstances.set(name, makeDbApi(new DatabaseSync(":memory:")));
    }
    return sqliteInstances.get(name);
  },
};

function resetDatabase() {
  sqliteInstances = new Map();
}

// ---------------------------------------------------------------- module stubs
const stubs = {
  "expo-file-system": { File: FSFile, Directory: FSDirectory, Paths },
  "expo-crypto": {
    getRandomBytes: (n) => new Uint8Array(nodeCrypto.randomBytes(n)),
    randomUUID: () => nodeCrypto.randomUUID(),
  },
  "expo-image-manipulator": {
    SaveFormat: { JPEG: "jpeg" },
    ImageManipulator: { manipulate: () => ({ resize: () => ({ renderAsync: async () => ({}) }) }) },
  },
  "expo-sqlite": expoSqlite,
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (stubs[request]) return "stub:" + request;
  if (request.startsWith("@/")) {
    return origResolve.call(this, path.join(BUILD, request.slice(2)), parent, ...rest);
  }
  return origResolve.call(this, request, parent, ...rest);
};
for (const key of Object.keys(stubs)) {
  require.cache["stub:" + key] = {
    id: "stub:" + key,
    filename: "stub:" + key,
    loaded: true,
    exports: stubs[key],
  };
}

module.exports = {
  BUILD,
  files,
  dirs,
  FSFile,
  FSDirectory,
  Paths,
  resetDatabase,
  load: (rel) => require(path.join(BUILD, rel)),
};
