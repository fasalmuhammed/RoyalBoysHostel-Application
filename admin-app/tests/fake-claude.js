/* In-memory stand-in for the claude.ai artifact runtime, for tests.

   Follows the platform contract the app relies on: JSON documents at
   slash paths, last-writer-wins `set`, merge-only `update` that requires the
   document to exist, equality/range filters, live `onSnapshot` delivery,
   cooperative leases (`acquire`) that expire on their own, a 256 KiB
   document limit and a 25,000 document cap. One `SharedStore` can back
   several runtimes, each standing in for a different person's device. */
const crypto = require("crypto");

const clone = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setTimeout(resolve, 1 + Math.random() * 4));

function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object" && !Array.isArray(current)
        ? merge(current, value)
        : value;
  }
  return out;
}

const collectionOf = (docPath) => docPath.split("/").slice(0, -1).join("/");

class SharedStore {
  constructor() {
    this.docs = new Map();
    this.leases = new Map();
    this.subs = new Set();
    this.assets = new Map();
    this.downloads = [];
    this.writes = 0;
  }

  query(collection, where) {
    const ok = (data) =>
      where.every(([field, op, value]) => {
        const x = data[field];
        if (op === "==") return x === value;
        if (op === "!=") return x !== value;
        if (op === ">=") return x >= value;
        if (op === "<=") return x <= value;
        if (op === ">") return x > value;
        if (op === "<") return x < value;
        if (op === "in") return value.includes(x);
        throw { code: "invalid_argument", message: `Unsupported operator ${op}` };
      });
    return [...this.docs.entries()]
      .filter(([p, data]) => collectionOf(p) === collection && ok(data))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([p, data]) => ({ id: p.split("/").pop(), data: clone(data) }));
  }

  notify(collection) {
    for (const sub of this.subs) {
      if (sub.collection !== collection) continue;
      const docs = this.query(sub.collection, sub.where);
      setTimeout(() => sub.alive && sub.next(snapshot(docs)), 0);
    }
  }

  write(docPath, data) {
    if (Buffer.byteLength(JSON.stringify(data)) > 256 * 1024) {
      throw { code: "invalid_argument", message: "Document over 256 KiB" };
    }
    if (!this.docs.has(docPath) && this.docs.size >= 25000) {
      throw { code: "quota_exceeded", message: "Document cap reached" };
    }
    this.writes += 1;
    this.docs.set(docPath, clone(data));
    this.notify(collectionOf(docPath));
  }
}

function snapshot(docs) {
  const list = docs.map((d) => ({
    id: d.id,
    exists: true,
    data: () => clone(d.data),
    metadata: { fromCache: false, hasPendingWrites: false },
  }));
  return { docs: list, size: list.length, empty: list.length === 0, metadata: { fromCache: false, hasPendingWrites: false } };
}

function makeRuntime(store, user) {
  function makeQuery(collection, where) {
    const query = {
      where: (field, op, value) => makeQuery(collection, [...where, [field, op, value]]),
      orderBy: () => query,
      limit: () => query,
      async get() {
        await tick();
        return snapshot(store.query(collection, where));
      },
      onSnapshot(next) {
        const sub = { collection, where, next, alive: true };
        store.subs.add(sub);
        setTimeout(() => sub.alive && next(snapshot(store.query(collection, where))), 0);
        return () => {
          sub.alive = false;
          store.subs.delete(sub);
        };
      },
    };
    return query;
  }

  function docRef(docPath) {
    return {
      id: docPath.split("/").pop(),
      path: docPath,
      async get() {
        await tick();
        const exists = store.docs.has(docPath);
        return { id: docPath.split("/").pop(), exists, data: () => (exists ? clone(store.docs.get(docPath)) : undefined), metadata: {} };
      },
      async set(data) {
        await tick();
        if (!user.canWrite) throw { code: "invalid_argument", message: "This viewer cannot write" };
        store.write(docPath, data);
      },
      async update(data) {
        await tick();
        if (!user.canWrite) throw { code: "invalid_argument", message: "This viewer cannot write" };
        if (!store.docs.has(docPath)) throw { code: "invalid_argument", message: "update needs an existing document" };
        store.write(docPath, merge(store.docs.get(docPath), data));
      },
      async delete() {
        await tick();
        store.docs.delete(docPath);
        store.notify(collectionOf(docPath));
      },
      async acquire({ holder, ttlMs }) {
        await tick();
        const now = Date.now();
        const ttl = Math.min(Math.max(ttlMs || 30000, 1000), 600000);
        const lease = store.leases.get(docPath);
        if (!lease || lease.expiresAt <= now || lease.holder === holder) {
          store.leases.set(docPath, { holder, expiresAt: now + ttl });
          return { acquired: true, expiresAt: new Date(now + ttl).toISOString(), holder };
        }
        return { acquired: false, expiresAt: new Date(lease.expiresAt).toISOString() };
      },
      collection: (sub) => collectionRef(`${docPath}/${sub}`),
    };
  }

  function collectionRef(collectionPath) {
    return Object.assign(makeQuery(collectionPath, []), {
      path: collectionPath,
      doc: (id) => docRef(`${collectionPath}/${id ?? crypto.randomUUID()}`),
    });
  }

  const caps = {
    db: { doc: docRef, collection: collectionRef },
    user: {
      isOwner: async () => Boolean(user.isOwner),
      canEdit: async () => Boolean(user.canEdit),
      can: async () => (user.canWrite === undefined ? null : user.canWrite),
      id: async () => user.id,
      profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, { id, name: id === user.id ? user.name : "", isMe: id === user.id }])),
    },
    assets: {
      async upload(blob, options) {
        const bytes = Buffer.from(await blob.arrayBuffer());
        const id = crypto.randomBytes(16).toString("hex");
        store.assets.set(id, { bytes, type: (options && options.type) || blob.type });
        return { id, url: `/_blob/${id}`, sizeBytes: bytes.length, contentType: (options && options.type) || blob.type };
      },
      async url(id) {
        return store.assets.has(id) ? `/_blob/${id}` : null;
      },
      async list() {
        const assets = [...store.assets].map(([id, a]) => ({ id, url: `/_blob/${id}`, contentType: a.type, sizeBytes: a.bytes.length, createdAt: "" }));
        return { assets, usage: { files: assets.length, bytes: assets.reduce((s, a) => s + a.sizeBytes, 0), maxFiles: 5000, maxBytes: 1 << 30 } };
      },
      async delete(id) {
        return { deleted: store.assets.delete(id) };
      },
    },
    downloads: {
      async save({ filename, data }) {
        store.downloads.push({ filename, data });
        return { saved: true };
      },
    },
  };

  return { use: async (name) => caps[name] ?? null };
}

module.exports = { SharedStore, makeRuntime };
