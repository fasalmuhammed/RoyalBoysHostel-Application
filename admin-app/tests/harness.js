/* Test harness: runs the real compiled service code in Node against the
   in-memory Claude storage stand-in (fake-claude.js).

   Each call to `device()` loads a fresh copy of the app's modules bound to its
   own runtime, so two devices in one test keep separate caches while sharing
   one store -- the situation of two phones open on the same hostel. */
const path = require("path");
const Module = require("module");
const nodeCrypto = require("crypto");
const { SharedStore, makeRuntime } = require("./fake-claude");

const BUILD = path.join(__dirname, "build");

// --- browser globals the services touch ----------------------------------------

const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoryStorage.has(k) ? memoryStorage.get(k) : null),
  setItem: (k, v) => memoryStorage.set(k, String(v)),
  removeItem: (k) => memoryStorage.delete(k),
  clear: () => memoryStorage.clear(),
};

/** The store whose files `/_blob/<id>` serves; set by each test. */
let blobStore = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const match = /^\/_blob\/([0-9a-f]{32})/.exec(String(url));
  if (!match) return realFetch(url, init);
  const asset = blobStore && blobStore.assets.get(match[1]);
  if (!asset) return new Response(null, { status: 404 });
  return new Response(asset.bytes, { status: 200, headers: { "content-type": asset.type } });
};

// --- module stubs --------------------------------------------------------------

const stubs = {
  "expo-crypto": {
    getRandomBytes: (n) => new Uint8Array(nodeCrypto.randomBytes(n)),
    randomUUID: () => nodeCrypto.randomUUID(),
  },
  // Only the surface the services touch; messaging.ts imports Linking.
  "react-native": {
    Platform: { OS: "web", select: (spec) => spec.web ?? spec.default },
    Linking: { canOpenURL: async () => true, openURL: async () => undefined },
  },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (stubs[request]) return `stub:${request}`;
  // The browser build swaps these for the web shims; so does the harness.
  if (request === "expo-file-system") return origResolve.call(this, path.join(BUILD, "web/shims/file-system"), parent, ...rest);
  if (request.startsWith("@/")) return origResolve.call(this, path.join(BUILD, request.slice(2)), parent, ...rest);
  return origResolve.call(this, request, parent, ...rest);
};
for (const key of Object.keys(stubs)) {
  require.cache[`stub:${key}`] = { id: `stub:${key}`, filename: `stub:${key}`, loaded: true, exports: stubs[key] };
}

// --- devices -------------------------------------------------------------------

const OWNER = { id: "u_owner0000000000000001", name: "Owner", isOwner: true, canEdit: true, canWrite: true };

/**
 * Loads a fresh copy of the app's modules as one person's device, opens the
 * records and returns the services. Capabilities are resolved immediately, so
 * the copy stays bound to this device's runtime when another one loads.
 */
async function device(store, user = OWNER) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BUILD)) delete require.cache[key];
  }
  globalThis.claude = makeRuntime(store, user);
  blobStore = store;
  const load = (rel) => require(path.join(BUILD, rel));
  const runtime = load("web/runtime");
  await Promise.all(["db", "user", "assets", "downloads"].map((name) => runtime.capability(name)));

  const api = {
    cloud: load("store/cloud"),
    views: load("store/views"),
    branches: load("services/branches"),
    settings: load("services/settings"),
    rooms: load("services/rooms"),
    inmates: load("services/inmates"),
    fees: load("services/fees"),
    complaints: load("services/complaints"),
    notices: load("services/notices"),
    messaging: load("services/messaging"),
    overview: load("services/overview"),
    csv: load("services/csv"),
    backup: load("services/backup"),
    photos: load("services/photos"),
    format: load("utils/format"),
    validate: load("utils/validate"),
    fs: load("web/shims/file-system"),
  };
  await api.cloud.openStore();
  return api;
}

/** Waits for the store's live delivery to settle. */
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { BUILD, SharedStore, device, settle, OWNER };
