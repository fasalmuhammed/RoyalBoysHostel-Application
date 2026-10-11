/* Runs the real services against the Firebase emulators (Auth + Firestore,
   with firestore.rules loaded): the admin's full flow, two devices racing,
   and a branch manager held to their own hostel.

   Run with: npm run test:firebase */
const path = require("path");
const { BUILD } = require("./harness");

const HOST = "127.0.0.1";
const PROJECT = "demo-hostel";
const AUTH = `http://${HOST}:9099`;
const STORE = `http://${HOST}:8080`;
const T = "branch-thammanam";
const K = "branch-Kalamassery";

let pass = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${extra !== undefined ? `  -> ${extra}` : ""}`);
  }
};
const rejects = async (promise, pattern) => {
  try {
    await promise;
    return false;
  } catch (error) {
    return pattern ? pattern.test(String(error && error.message)) : true;
  }
};
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

// --- emulator set-up ------------------------------------------------------------

async function resetEmulators() {
  await fetch(`${STORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

const fieldsOf = (data) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value === null ? { nullValue: null }
        : typeof value === "boolean" ? { booleanValue: value }
        : typeof value === "number" ? { integerValue: String(value) }
        : { stringValue: String(value) },
    ])
  );

/** Creates a login the way the server will: an auth user plus its staff record. */
async function createLogin({ username, password = "secret123", name, role, branchId = null, disabled = false }) {
  const { loginEmail } = require(path.join(BUILD, "backend/firebase"));
  const signUp = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: loginEmail(username), password, returnSecureToken: true }),
  });
  const { localId } = await signUp.json();
  const now = Date.now();
  await fetch(`${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/staff/${localId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ fields: fieldsOf({ uid: localId, username, name, role, branchId, disabled, createdAt: now, updatedAt: now }) }),
  });
  return localId;
}

let appCounter = 0;

/** A fresh copy of the app's modules, signed in as one person on one device. */
async function device(username, password = "secret123") {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BUILD)) delete require.cache[key];
  }
  const load = (rel) => require(path.join(BUILD, rel));
  const { createFirebaseBackend } = load("backend/firebase");
  const backend = createFirebaseBackend({
    config: { projectId: PROJECT, apiKey: "fake-key", storageBucket: `${PROJECT}.appspot.com` },
    emulatorHost: HOST,
    appName: `device-${++appCounter}`,
  });
  if (username) await backend.signIn(username, password);
  const runtime = load("web/runtime");
  runtime.setBackend(backend);
  await Promise.all(["db", "user", "assets", "downloads"].map((name) => runtime.capability(name)));
  const api = {
    backend,
    cloud: load("store/cloud"),
    views: load("store/views"),
    branches: load("services/branches"),
    settings: load("services/settings"),
    rooms: load("services/rooms"),
    inmates: load("services/inmates"),
    fees: load("services/fees"),
    notices: load("services/notices"),
    complaints: load("services/complaints"),
    messaging: load("services/messaging"),
    photos: load("services/photos"),
    backup: load("services/backup"),
  };
  return api;
}

const inmate = (name, roomId, extra = {}) => ({
  admissionNo: "", fullName: name, phone: "9876500000", guardianName: "", guardianPhone: "",
  email: "", course: "", year: "", address: "", idProof: "", photoFile: null, idProofFile: null,
  idProofBackFile: null, roomId: roomId ?? null, branchId: "", status: "active", monthlyRent: 6000,
  billingCycleDays: 30, admissionType: "monthly", stayDays: null, joinedOn: "2026-01-15", leftOn: null, notes: "",
  ...extra,
});
const room = (number, capacity) => ({
  branchId: "", block: "A", roomNumber: number, floor: "", capacity, rent: 5000, deposit: 0, amenities: "", notes: "",
});
const bill = (studentId, period) => ({ studentId, period, rent: 5000, electricity: 0, water: 0, other: 0, discount: 0, dueDate: `${period}-15`, note: "" });

// --- suites ---------------------------------------------------------------------

async function adminFlow() {
  console.log("Admin on Firebase");
  const a = await device("admin");
  await a.cloud.openStore();
  await a.branches.seedBranches();
  await a.messaging.seedTemplates();
  a.branches.setActiveBranchId(T);
  await settle();
  check("branches and templates seeded", (await a.branches.listBranches()).length === 2 && (await a.messaging.listTemplates()).length === 5);

  const r = await a.rooms.createRoom(room("101", 1));
  const id = await a.inmates.createInmate(inmate("Arjun", r));
  check("inmate admitted with number 1", (await a.inmates.getInmate(id)).admissionNo === "1");
  check("full room refused", await rejects(a.inmates.createInmate(inmate("Dev", r)), /is full/));

  const billId = await a.fees.createFee(bill(id, "2026-03"));
  await a.fees.recordPayment(billId, 2000, "cash", "2026-03-10", "", "");
  await a.fees.recordPayment(billId, 1000, "upi", "2026-03-11", "", "");
  let fee = await a.fees.getFee(billId);
  check("payments merge into the bill without replacing each other", fee.amountPaid === 3000 && (await a.fees.listPayments(billId)).length === 2);
  check("overpayment refused", await rejects(a.fees.recordPayment(billId, 2500, "cash", "2026-03-12", "", ""), /outstanding balance/));
  const [latest] = await a.fees.listPayments(billId);
  await a.fees.deletePayment(latest.id);
  fee = await a.fees.getFee(billId);
  check("reversing a payment restores the balance", fee.amountPaid === 2000 && fee.status === "partial");
  check("duplicate bill refused", await rejects(a.fees.createFee(bill(id, "2026-03")), /already exists/));

  const gen = await a.fees.generateInvoices("2026-04");
  const again = await a.fees.generateInvoices("2026-04");
  check("monthly bills raised once", gen.created === 1 && again.created === 0);

  const batch = await a.messaging.queueBatch("announcement", [
    { studentId: id, name: "Arjun", phone: "1", body: "hello" },
    { studentId: null, name: "B", phone: "2", body: "hello" },
  ]);
  const entries = await a.messaging.listBatchEntries(batch);
  await a.messaging.markMessage(entries[0].id, "sent");
  const summary = (await a.messaging.listBatches()).find((s) => s.batchId === batch);
  check("marking one message sent leaves the other queued", summary.sent === 1 && summary.pending === 1);

  await a.inmates.deleteInmate(id);
  await settle();
  check("deleting an inmate removes their bills", a.views.allBills().length === 0);
  return a;
}

async function twoDevices(a) {
  console.log("Two devices on Firebase");
  const b = await device("admin");
  await b.cloud.openStore();
  b.branches.setActiveBranchId(T);
  let heard = 0;
  b.cloud.subscribeStore(() => (heard += 1));

  const live = await a.inmates.createInmate(inmate("Live one", null));
  await settle(800);
  check("a change on one device reaches the other live", heard > 0 && (await b.inmates.getInmate(live)) !== null);

  const bed = await a.rooms.createRoom(room("9", 1));
  await settle(800);
  const race = await Promise.allSettled([
    a.inmates.createInmate(inmate("From A", bed)),
    b.inmates.createInmate(inmate("From B", bed)),
  ]);
  check("racing for the last bed: exactly one gets it", race.filter((r) => r.status === "fulfilled").length === 1, race.map((r) => r.status).join(","));

  const billId = await a.fees.createFee(bill(live, "2026-06"));
  await settle(800);
  const pay = await Promise.allSettled([
    a.fees.recordPayment(billId, 3000, "cash", "2026-06-01", "", ""),
    b.fees.recordPayment(billId, 3000, "cash", "2026-06-01", "", ""),
  ]);
  await settle(800);
  const paid = (await a.fees.getFee(billId)).amountPaid;
  check("two collectors cannot take more than is owed", pay.filter((r) => r.status === "fulfilled").length === 1 && paid === 3000, `paid ${paid}`);
}

async function managerScope(a) {
  console.log("Branch manager on Firebase");
  // The admin prepares one inmate, room and notice in each hostel.
  a.branches.setActiveBranchId(K);
  const kRoom = await a.rooms.createRoom(room("201", 2));
  const kInmate = await a.inmates.createInmate(inmate("Kiran of Kalamassery", kRoom));
  const kBill = await a.fees.createFee(bill(kInmate, "2026-05"));
  await a.notices.createNotice({ branchId: K, title: "K only", body: "", category: "general", pinned: false, postedOn: "" });
  await a.notices.createNotice({ branchId: null, title: "For everyone", body: "", category: "general", pinned: false, postedOn: "" });
  a.branches.setActiveBranchId(T);
  const tInmate = await a.inmates.createInmate(inmate("Tarun of Thammanam", null));
  await a.fees.createFee(bill(tInmate, "2026-05"));

  const m = await device("thammanam");
  await m.cloud.openStore();
  m.branches.setActiveBranchId(T);
  await settle();

  check("manager is limited to their branch", m.cloud.limitedToBranch() === T);
  const names = m.views.allInmates().map((i) => i.fullName);
  check("manager sees their own inmates", names.includes("Tarun of Thammanam"));
  check("manager never receives the other branch's inmates", !names.includes("Kiran of Kalamassery"));
  check("manager never receives the other branch's rooms or bills",
    !m.views.allRooms().some((r) => r.id === kRoom) && !m.views.allBills().some((b) => b.id === kBill));
  const titles = (await m.notices.listNotices()).map((n) => n.title);
  check("manager sees shared notices but not the other branch's", titles.includes("For everyone") && !titles.includes("K only"));

  // Asking the server directly, as a tampered app would.
  const { getDoc, doc, setDoc } = require("firebase/firestore");
  let directRead = "read succeeded";
  try {
    const snap = await getDoc(doc(m.backend.firestore, "inmates", kInmate));
    directRead = `read succeeded, exists=${snap.exists()}, fromCache=${snap.metadata.fromCache}`;
  } catch (error) {
    directRead = String(error && (error.code || error.message));
  }
  check("server refuses a direct read of the other branch's inmate", /permission/i.test(directRead), directRead);
  check("server refuses a direct write into the other branch",
    await rejects(setDoc(doc(m.backend.firestore, "rooms", "sneaky"), { id: "sneaky", branchId: K, roomNumber: "1", block: "", capacity: 1 }), /permission/i));
  check("server refuses a manager changing their own access",
    await rejects(setDoc(doc(m.backend.firestore, "staff", m.backend.session().user.uid), { role: "admin" }, { merge: true }), /permission/i));

  const mine = await m.inmates.createInmate(inmate("Added by manager", null));
  check("manager can admit into their own branch", (await m.inmates.getInmate(mine)).branchId === T);
  const mBill = await m.fees.createFee(bill(mine, "2026-05"));
  await m.fees.recordPayment(mBill, 1000, "cash", "2026-05-02", "", "");
  check("manager can bill and collect in their own branch", (await m.fees.getFee(mBill)).amountPaid === 1000);
  await m.inmates.deleteInmate(mine);
  check("manager can delete an inmate of their branch", (await m.inmates.getInmate(mine)) === null);

  check("manager cannot move an inmate to the other branch", await rejects(m.inmates.moveToBranch(tInmate, K), /not allowed/));
  check("manager cannot change hostel settings", await rejects(m.settings.saveSettings({ hostelName: "Hacked" }), /not allowed/));

  await settle(800);
  check("admin sees what the manager did, live", a.cloud.recentActivity().some((e) => e.label === "Added by manager"));
}

const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

async function photoStorage(a) {
  console.log("Photos on Firebase Storage");
  const { ref, uploadBytes } = require("firebase/storage");

  const tPhoto = await a.photos.uploadPhotoBase64(TINY_JPEG, T);
  const kPhoto = await a.photos.uploadPhotoBase64(TINY_JPEG, K);
  check("photos are filed in their branch's folder", tPhoto.startsWith(`photos~${T}~`) && kPhoto.startsWith(`photos~${K}~`), tPhoto);
  check("a stored photo reads back unchanged", (await a.photos.readPhotoBase64(tPhoto)) === TINY_JPEG);
  check("admin can open both branches' photos", Boolean(await a.photos.photoUrl(tPhoto)) && Boolean(await a.photos.photoUrl(kPhoto)));

  const m = await device("thammanam");
  await m.cloud.openStore();
  m.branches.setActiveBranchId(T);
  check("manager can open their own branch's photo", (await m.photos.readPhotoBase64(tPhoto)) === TINY_JPEG);
  check("manager cannot open the other branch's photo", (await m.photos.photoUrl(kPhoto)) === null);
  check("manager cannot upload into the other branch", await rejects(m.photos.uploadPhotoBase64(TINY_JPEG, K)));
  const own = await m.photos.uploadPhotoBase64(TINY_JPEG, T);
  check("manager can upload into their own branch", own.startsWith(`photos~${T}~`));

  const bytes = Buffer.from(TINY_JPEG, "base64");
  check("server refuses a file that is not a JPEG",
    await rejects(uploadBytes(ref(m.backend.storage, `photos/${T}/note.txt`), bytes, { contentType: "text/plain" })));
  check("server refuses an oversized photo",
    await rejects(uploadBytes(ref(m.backend.storage, `photos/${T}/huge.jpg`), Buffer.alloc(2 * 1024 * 1024), { contentType: "image/jpeg" })));

  // Moving an inmate between hostels takes their photos along.
  a.branches.setActiveBranchId(T);
  const mover = await a.inmates.createInmate(inmate("Mover", null, { photoFile: tPhoto }));
  await a.inmates.moveToBranch(mover, K);
  await settle(800);
  const moved = a.views.inmateById(mover);
  check("moving an inmate moves their photo to the new branch", moved.branchId === K && moved.photoFile.startsWith(`photos~${K}~`), moved.photoFile);
  check("the photo still opens after the move", (await a.photos.readPhotoBase64(moved.photoFile)) === TINY_JPEG);

  const usage = await a.photos.measurePhotoUsage();
  check("storage use can be measured", usage > 0, String(usage));

  const snapshot = await a.backup.writeAutoBackup();
  await settle();
  check("admin can save a snapshot", a.backup.listLocalBackups().length === 1 && snapshot.sizeBytes > 0);
  check("manager cannot save a snapshot", await rejects(m.backup.writeAutoBackup()));
}

async function logins() {
  console.log("Logins");
  const { LoginError } = require(path.join(BUILD, "backend/firebase"));
  const d = await device(null);
  let wrong = null;
  try {
    await d.backend.signIn("admin", "wrong-password");
  } catch (error) {
    wrong = error;
  }
  check("wrong password refused with a plain message", wrong instanceof LoginError || /not right/.test(String(wrong && wrong.message)), wrong && wrong.message);
  check("a switched-off login is refused", await rejects(d.backend.signIn("former", "secret123"), /switched off/));
  check("without a login the records do not open", await rejects(d.cloud.openStore()));
}

(async () => {
  const started = Date.now();
  await resetEmulators();
  await createLogin({ username: "admin", name: "Admin", role: "admin" });
  await createLogin({ username: "thammanam", name: "Thammanam manager", role: "manager", branchId: T });
  await createLogin({ username: "former", name: "Former manager", role: "manager", branchId: K, disabled: true });
  try {
    const a = await adminFlow();
    await twoDevices(a);
    await managerScope(a);
    await photoStorage(a);
    await logins();
  } catch (error) {
    fail += 1;
    console.log(`  FAIL crashed -> ${error && error.stack ? error.stack : JSON.stringify(error)}`);
  }
  console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  process.exit(fail ? 1 : 0);
})();
