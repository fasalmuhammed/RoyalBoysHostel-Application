const h = require("./harness");

let pass = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) {
    pass += 1;
    console.log("  ok   " + name);
  } else {
    fail += 1;
    console.log("  FAIL " + name + (extra ? "  -> " + extra : ""));
  }
};

const inmates = h.load("services/inmates");
const rooms = h.load("services/rooms");
const fees = h.load("services/fees");
const settings = h.load("services/settings");
const branches = h.load("services/branches");
const backup = h.load("services/backup");
const photos = h.load("services/photos");
const notices = h.load("services/notices");
const schema = h.load("db/schema");
const complaints = h.load("services/complaints");
const db = h.load("db");
const { File } = require("expo-file-system");

const TRICKY_NAME = 'Anjali "AJ" Mehta शर्मा ₹';

async function seed() {
  // Writes require a branch; migrations seed the two real ones.
  branches.setActiveBranchId("branch-thammanam");
  await settings.saveSettings({ hostelName: "Green Valley Boys Hostel", defaultRent: 6000 });

  const roomA = await rooms.createRoom({
    branchId: "", block: "A", roomNumber: "101", floor: "1", capacity: 2,
    rent: 6000, deposit: 6000, amenities: "Wi-Fi,AC", notes: "",
  });
  const roomB = await rooms.createRoom({
    branchId: "", block: "B", roomNumber: "205", floor: "2", capacity: 1,
    rent: 7500, deposit: 7500, amenities: "Wi-Fi", notes: "corner room",
  });

  const mk = (name, room, phone) => ({
    admissionNo: "ADM" + phone.slice(-3), fullName: name, phone,
    guardianName: "Guardian of " + name, guardianPhone: "9000000000",
    email: "x@example.com", course: "CSE", year: "2",
    address: "12, Main Road\nSecond line", idProof: "Aadhaar 1234",
    photoFile: null, roomId: room, branchId: "", status: "active",
    monthlyRent: 6000, billingCycleDays: 30,
    joinedOn: "2026-01-15", leftOn: null, notes: "",
  });

  const s1 = await inmates.createInmate(mk("Rahul Sharma", roomA, "9876543210"));
  const s2 = await inmates.createInmate(mk(TRICKY_NAME, roomA, "9876543211"));
  const s3 = await inmates.createInmate(mk("Vikram Singh", roomB, "9876543212"));

  // Two students carry photos.
  photos.writePhotoBase64("p1.jpg", Buffer.from("fake-jpeg-bytes-one").toString("base64"));
  photos.writePhotoBase64("p2.jpg", Buffer.from("fake-jpeg-bytes-two éñ").toString("base64"));
  const d = await db.getDb();
  await d.runAsync("UPDATE students SET photoFile = ? WHERE id = ?;", "p1.jpg", s1);
  await d.runAsync("UPDATE students SET photoFile = ? WHERE id = ?;", "p2.jpg", s2);

  const f1 = await fees.createFee({
    studentId: s1, period: "2026-08", rent: 6000, electricity: 500, water: 200,
    other: 0, discount: 0, dueDate: "2026-08-10", note: "",
  });
  await fees.createFee({
    studentId: s2, period: "2026-08", rent: 6000, electricity: 0, water: 0,
    other: 0, discount: 500, dueDate: "2026-08-10", note: "sibling discount",
  });
  await fees.recordPayment(f1, 3000, "upi", "2026-08-05", "TXN123", "part payment");

  await complaints.createComplaint({
    branchId: "", roomId: roomA, studentId: s1,
    title: "Light flickering", description: 'Tube light in the "corner" flickers.',
    category: "electrical", status: "in_progress", photoFile: null, raisedOn: "2026-08-03",
  });

  await notices.createNotice({
    branchId: null,
    title: "Holiday Notice",
    body: 'Hostel will be closed on 15 Aug.\nPlease inform the \"office\" before leaving.',
    category: "general",
    pinned: true,
    postedOn: "2026-08-01",
  });
  await notices.createNotice({
    branchId: null,
    title: "Maintenance नोटिस",
    body: "Water supply off 10am-2pm.",
    category: "maintenance",
    pinned: false,
    postedOn: "2026-08-09",
  });

  return { s1, s2, s3, roomA, roomB, f1 };
}

async function snapshot() {
  const d = await db.getDb();
  const out = {};
  for (const t of ["branches", "rooms", "students", "fee_records", "payments", "notices", "complaints", "settings"]) {
    // The SQL table is still `students`; expose it under the name the app uses.
    const key = t === "students" ? "inmates" : t;
    out[key] = await d.getAllAsync("SELECT * FROM " + t + " ORDER BY " + (t === "settings" ? "key" : "id") + ";");
  }
  return out;
}

async function run() {
  console.log("== seed ==");
  const ids = await seed();
  console.log("\n== a second branch, to prove the backup is not scoped ==");
  {
    branches.setActiveBranchId("branch-kakkanad");
    const kRoom = await rooms.createRoom({
      branchId: "", block: "K", roomNumber: "7", floor: "", capacity: 2,
      rent: 7000, deposit: 0, amenities: "", notes: "",
    });
    await inmates.createInmate({
      admissionNo: "", fullName: "Kakkanad Person", phone: "9871234567",
      guardianName: "", guardianPhone: "", email: "", course: "", year: "",
      address: "", idProof: "", photoFile: null, roomId: kRoom, branchId: "",
      status: "active", monthlyRent: 7000, billingCycleDays: 30,
      joinedOn: "2026-03-01", leftOn: null, notes: "",
    });
    const kOnly = await inmates.listInmates("", "all");
    check("Kakkanad sees only its own inmate", kOnly.length === 1, "n=" + kOnly.length);
    // Export runs with a branch active; it must still capture everything.
    branches.setActiveBranchId("branch-thammanam");
  }

  const before = await snapshot();
  check("seeded 4 inmates across both branches", before.inmates.length === 4, "n=" + before.inmates.length);
  check("seeded 3 rooms across both branches", before.rooms.length === 3, "n=" + before.rooms.length);
  check("seeded 2 invoices", before.fee_records.length === 2);
  check("seeded 1 payment", before.payments.length === 1);
  check("seeded 2 notices", before.notices.length === 2, "n=" + before.notices.length);
  check("seeded 1 complaint", before.complaints.length === 1, "n=" + before.complaints.length);

  const paid = before.fee_records.find((f) => f.id === ids.f1);
  check("payment advanced amountPaid", paid.amountPaid === 3000, "got " + paid.amountPaid);

  console.log("\n== encrypted export ==");
  const PASS = "hostel-secret-2026";
  const exported = await backup.exportForSharing(PASS);
  check("export produced a file", exported.sizeBytes > 0, "size " + exported.sizeBytes);
  check("export reports encrypted", exported.encrypted === true);
  check("export counts every branch", exported.counts.students === 4, "n=" + exported.counts.students);
  check("counts: 2 photos", exported.counts.photos === 2);

  const raw = h.files.get(exported.uri).toString("utf8");
  check("student name is not readable in ciphertext", !raw.includes("Rahul Sharma"));
  check("phone number is not readable in ciphertext", !raw.includes("9876543210"));
  check("header line is plaintext JSON", raw.split("\n")[0].startsWith('{"format":"hostel-backup"'));

  console.log("\n== header inspection ==");
  const header = backup.readBackupHeader(exported.uri);
  check("header hostel name", header.hostelName === "Green Valley Boys Hostel");
  check("header marks encryption", header.encryption !== null);
  check("header carries salt", typeof header.encryption.salt === "string" && header.encryption.salt.length > 0);
  check("header stamps the current schema version", header.schemaVersion === schema.SCHEMA_VERSION, "got " + header.schemaVersion);

  console.log("\n== wrong passphrase is rejected ==");
  let threw = null;
  try {
    await backup.restoreBackup(exported.uri, "wrong-passphrase");
  } catch (e) {
    threw = e;
  }
  check("restore rejected", threw !== null, threw && threw.message);
  check("error names passphrase or damage", threw && /passphrase|damaged/i.test(threw.message));
  const afterFailed = await snapshot();
  check("data untouched after failed restore", afterFailed.inmates.length === 4, "n=" + afterFailed.inmates.length);

  console.log("\n== tampered file is rejected ==");
  const tamperUri = exported.uri + ".tampered";
  const lines = raw.split("\n");
  const flip = lines[1];
  lines[1] = flip.slice(0, 20) + (flip[20] === "A" ? "B" : "A") + flip.slice(21);
  h.files.set(tamperUri, Buffer.from(lines.join("\n"), "utf8"));
  let tamperErr = null;
  try {
    await backup.restoreBackup(tamperUri, PASS);
  } catch (e) {
    tamperErr = e;
  }
  check("tampered chunk rejected by MAC", tamperErr !== null, tamperErr && tamperErr.message);

  console.log("\n== truncated file is rejected ==");
  const truncUri = exported.uri + ".trunc";
  h.files.set(truncUri, Buffer.from(raw.slice(0, Math.floor(raw.length * 0.6)), "utf8"));
  let truncErr = null;
  try {
    await backup.restoreBackup(truncUri, PASS);
  } catch (e) {
    truncErr = e;
  }
  check("truncated file rejected", truncErr !== null, truncErr && truncErr.message);

  console.log("\n== wipe and restore on a 'new phone' ==");
  await db.wipeAllData();
  photos.deleteAllPhotos();
  const empty = await snapshot();
  check("database emptied", empty.inmates.length === 0 && empty.rooms.length === 0);

  const result = await backup.restoreBackup(exported.uri, PASS);
  check("restore reported rows", result.rowsRestored > 0, "rows " + result.rowsRestored);
  check("restore reported 2 photos", result.photosRestored === 2, "photos " + result.photosRestored);

  const after = await snapshot();
  console.log("\n== fidelity ==");
  check("inmates restored", after.inmates.length === 4, "got " + after.inmates.length);
  check("rooms restored", after.rooms.length === 3, "n=" + after.rooms.length);
  check("invoices restored", after.fee_records.length === 2);
  check("payments restored", after.payments.length === 1);

  const norm = (arr) => JSON.stringify(arr);
  check("rooms identical", norm(after.rooms) === norm(before.rooms));
  check("students identical", norm(after.inmates) === norm(before.inmates));
  check("fee_records identical", norm(after.fee_records) === norm(before.fee_records));
  check("payments identical", norm(after.payments) === norm(before.payments));
  check("settings identical", norm(after.settings) === norm(before.settings));
  check("notices identical", norm(after.notices) === norm(before.notices));
  check("complaints identical", norm(after.complaints) === norm(before.complaints));
  const restoredComplaint = after.complaints[0];
  check("complaint status preserved", restoredComplaint.status === "in_progress", restoredComplaint.status);
  check("complaint keeps its quoted text", restoredComplaint.description.includes('\"corner\"'), restoredComplaint.description);
  check("complaint still linked to its room", restoredComplaint.roomId === before.complaints[0].roomId);
  check("branches identical", norm(after.branches) === norm(before.branches));
  check("both branches restored", after.branches.length === 2, "n=" + after.branches.length);

  console.log("\n== the backup covered every branch, not just the active one ==");
  {
    branches.setActiveBranchId("branch-thammanam");
    const t = await inmates.listInmates("", "all");
    check("Thammanam inmates came back", t.length === 3, "n=" + t.length);
    check("and none of them belong to Kakkanad",
      t.every((s) => s.fullName !== "Kakkanad Person"), t.map((s) => s.fullName).join(","));

    branches.setActiveBranchId("branch-kakkanad");
    const k = await inmates.listInmates("", "all");
    check("Kakkanad inmate came back too", k.length === 1 && k[0].fullName === "Kakkanad Person",
      k.map((s) => s.fullName).join(","));
    check("its room came back as well", (await rooms.listRooms()).length === 1);

    branches.setActiveBranchId("branch-thammanam");
  }
  check("notices restored", after.notices.length === 2, "n=" + after.notices.length);
  const restoredNotice = after.notices.find((n) => n.title === "Holiday Notice");
  check("notice body kept newlines and quotes", restoredNotice.body.includes("\n") && restoredNotice.body.includes('\"office\"'), JSON.stringify(restoredNotice.body));
  check("pinned flag survived", restoredNotice.pinned === 1, "pinned=" + restoredNotice.pinned);
  const hydrated = await notices.listNotices("all");
  check("pinned notice sorts first after restore", hydrated[0].title === "Holiday Notice", hydrated[0].title);

  const restoredTricky = after.inmates.find((s) => s.fullName === TRICKY_NAME);
  check("unicode + quotes name survived", !!restoredTricky, "names: " + after.inmates.map((s) => s.fullName).join(" | "));
  const multiline = after.inmates.find((s) => s.address.includes("\n"));
  check("multi-line address survived", !!multiline);

  console.log("\n== photo fidelity ==");
  const p1 = await photos.readPhotoBase64("p1.jpg");
  const p2 = await photos.readPhotoBase64("p2.jpg");
  check("photo 1 bytes identical", p1 === Buffer.from("fake-jpeg-bytes-one").toString("base64"));
  check("photo 2 bytes identical", p2 === Buffer.from("fake-jpeg-bytes-two éñ").toString("base64"));

  console.log("\n== relationships still work after restore ==");
  const list = await inmates.listInmates("", "active");
  check("student list rebuilt for the active branch", list.length === 3, "n=" + list.length);
  const withRoom = list.filter((s) => s.roomLabel);
  check("room labels resolve", withRoom.length === 3, JSON.stringify(list.map((s) => s.roomLabel)));
  const occ = await rooms.occupancyTotals();
  check("occupancy: 3 beds, 3 occupied", occ.beds === 3 && occ.occupied === 3, JSON.stringify(occ));
  const totals = await fees.feeTotals("2026-08");
  check("fee totals billed 12200", Math.round(totals.billed) === 12200, "billed " + totals.billed);
  check("fee totals collected 3000", Math.round(totals.collected) === 3000);
  check("one partial invoice", totals.partialCount === 1, JSON.stringify(totals));

  console.log("\n== safety snapshot ==");
  check("safety snapshot was written", typeof result.safetySnapshotUri === "string" && result.safetySnapshotUri.length > 0);
  const locals = backup.listLocalBackups();
  check("local backups listed", locals.length >= 1, "n=" + locals.length);

  console.log("\n== unencrypted auto-backup round trip ==");
  const auto = await backup.writeAutoBackup();
  check("auto backup is unencrypted", auto.encrypted === false);
  await db.wipeAllData();
  photos.deleteAllPhotos();
  const autoResult = await backup.restoreBackup(auto.uri, null);
  const afterAuto = await snapshot();
  check("auto backup restores inmates", afterAuto.inmates.length === 4, "got " + afterAuto.inmates.length);
  check("auto backup restores photos", autoResult.photosRestored === 2);
  check("auto backup fidelity", norm(afterAuto.inmates) === norm(before.inmates));

  console.log("\n== chunking: large dataset spans many chunks ==");
  for (let i = 0; i < 60; i += 1) {
    photos.writePhotoBase64("bulk" + i + ".jpg", Buffer.alloc(20000, i % 251).toString("base64"));
  }
  const d = await db.getDb();
  const bulkIds = [];
  for (let i = 0; i < 60; i += 1) {
    const id = await inmates.createInmate({
      admissionNo: "B" + i, fullName: "Bulk Inmate " + i, phone: "90000000" + String(i).padStart(2, "0"),
      guardianName: "G", guardianPhone: "9", email: "", course: "ME", year: "1",
      address: "addr", idProof: "", photoFile: null, roomId: null, branchId: "", status: "active",
      monthlyRent: 5000, billingCycleDays: 30,
      joinedOn: "2026-02-01", leftOn: null, notes: "",
    });
    await d.runAsync("UPDATE students SET photoFile = ? WHERE id = ?;", "bulk" + i + ".jpg", id);
    bulkIds.push(id);
  }
  const bigBefore = await snapshot();
  const bigExport = await backup.exportForSharing(PASS);
  const bigRaw = h.files.get(bigExport.uri).toString("utf8");
  const chunkLines = bigRaw.split("\n").filter(Boolean).length - 2; // minus header, trailer
  check("large export spans multiple chunks", chunkLines > 3, "chunks=" + chunkLines);
  check("large export counts every inmate", bigExport.counts.students === 64, JSON.stringify(bigExport.counts));

  await db.wipeAllData();
  photos.deleteAllPhotos();
  const bigResult = await backup.restoreBackup(bigExport.uri, PASS);
  const bigAfter = await snapshot();
  check("all 64 inmates restored", bigAfter.inmates.length === 64, "got " + bigAfter.inmates.length);
  check("all 62 photos restored", bigResult.photosRestored === 62, "got " + bigResult.photosRestored);
  check("large dataset identical", norm(bigAfter.inmates) === norm(bigBefore.inmates));
  const bulkPhoto = await photos.readPhotoBase64("bulk7.jpg");
  check("bulk photo bytes identical", bulkPhoto === Buffer.alloc(20000, 7).toString("base64"));

  console.log("\n== not-a-backup file ==");
  const junkUri = "file:///cache/exports/junk.hostelbak";
  h.files.set(junkUri, Buffer.from("this is not a backup\nat all\n", "utf8"));
  let junkErr = null;
  try {
    backup.readBackupHeader(junkUri);
  } catch (e) {
    junkErr = e;
  }
  check("junk file rejected with a clear message", junkErr !== null && /not a hostel backup/i.test(junkErr.message), junkErr && junkErr.message);

  console.log("\n== the admission sequence survives a restore ==");
  {
    const beforeNext = await inmates.peekNextAdmissionNo();
    const issued = (await inmates.listInmates("", "all")).map((s) => Number(s.admissionNo));
    const highest = Math.max(0, ...issued.filter((n) => Number.isFinite(n)));
    check("next number is past every number in use", Number(beforeNext) > highest, beforeNext + " vs " + highest);

    const fresh = await inmates.createInmate({
      admissionNo: "", fullName: "Post Restore", phone: "9800000000", guardianName: "",
      guardianPhone: "", email: "", course: "", year: "", address: "", idProof: "",
      photoFile: null, roomId: null, branchId: "", status: "active", monthlyRent: 0, billingCycleDays: 30,
      joinedOn: "2026-09-01", leftOn: null, notes: "",
    });
    const freshRow = await inmates.getInmate(fresh);
    check("a student added after restore does not collide", freshRow.admissionNo === beforeNext, freshRow.admissionNo);
    const all = await inmates.listInmates("", "all");
    const numbers = all.map((s) => s.admissionNo);
    check("all admission numbers remain unique", new Set(numbers).size === numbers.length, numbers.join(","));
    await inmates.deleteInmate(fresh);
  }

  console.log("\n== backup from a newer app version is refused ==");
  const futureUri = exported.uri + ".future";
  const futureLines = h.files.get(exported.uri).toString("utf8").split("\n");
  const futureHeader = JSON.parse(futureLines[0]);
  futureHeader.schemaVersion = 99;
  futureLines[0] = JSON.stringify(futureHeader);
  h.files.set(futureUri, Buffer.from(futureLines.join("\n"), "utf8"));
  let futureErr = null;
  try {
    backup.readBackupHeader(futureUri);
  } catch (e) {
    futureErr = e;
  }
  check("newer-schema backup rejected", futureErr !== null, futureErr && futureErr.message);
  check("tells the user to update", futureErr && /update/i.test(futureErr.message), futureErr && futureErr.message);

  console.log("\n== encrypted file without passphrase ==");
  let noPassErr = null;
  try {
    await backup.restoreBackup(exported.uri, null);
  } catch (e) {
    noPassErr = e;
  }
  check("prompts for passphrase", noPassErr !== null && /encrypted/i.test(noPassErr.message), noPassErr && noPassErr.message);

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error("\nHARNESS ERROR:", e);
  process.exit(1);
});
