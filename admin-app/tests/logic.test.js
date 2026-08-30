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

const students = h.load("services/students");
const rooms = h.load("services/rooms");
const fees = h.load("services/fees");
const settings = h.load("services/settings");
const branches = h.load("services/branches");
const format = h.load("utils/format");
const validate = h.load("utils/validate");
const csv = h.load("services/csv");
const notices = h.load("services/notices");
const photos = h.load("services/photos");
const messaging = h.load("services/messaging");

const mk = (name, roomId, extra) =>
  Object.assign(
    {
      admissionNo: "", fullName: name, phone: "9876500000", guardianName: "", guardianPhone: "",
      email: "", course: "", year: "", address: "", idProof: "", photoFile: null,
      roomId: roomId ?? null, branchId: "", status: "active", monthlyRent: 6000, billingCycleDays: 30,
      joinedOn: "2026-01-01", leftOn: null, notes: "",
    },
    extra || {}
  );

async function run() {
  // Writes require a branch; migrations seed the two real ones.
  branches.setActiveBranchId("branch-thammanam");
  console.log("== room capacity is enforced ==");
  const single = await rooms.createRoom({
    branchId: "", block: "A", roomNumber: "1", floor: "", capacity: 1,
    rent: 5000, deposit: 0, amenities: "", notes: "",
  });

  const s1 = await students.createStudent(mk("First Student", single));
  check("first student fits", typeof s1 === "string");

  let overfill = null;
  try {
    await students.createStudent(mk("Second Student", single));
  } catch (e) {
    overfill = e;
  }
  check("second student rejected", overfill instanceof students.RoomFullError, overfill && overfill.message);
  check("error message names the room", overfill && /Room A-1 is full/.test(overfill.message), overfill && overfill.message);

  const occAfter = await rooms.getRoom(single);
  check("occupancy stayed at 1", occAfter.occupied === 1, "occupied=" + occAfter.occupied);
  const allStudents = await students.listStudents("", "all");
  check("rejected student was not created", allStudents.length === 1, "count=" + allStudents.length);

  console.log("\n== moving out frees the bed ==");
  await students.markLeft(s1);
  const freed = await rooms.getRoom(single);
  check("bed freed after marking left", freed.occupied === 0 && freed.vacant === 1);
  const s2 = await students.createStudent(mk("Replacement", single));
  check("replacement now fits", typeof s2 === "string");

  console.log("\n== editing a student in place does not self-block ==");
  await students.updateStudent(s2, mk("Replacement Renamed", single));
  const renamed = await students.getStudent(s2);
  check("student renamed while keeping room", renamed.fullName === "Replacement Renamed" && renamed.roomId === single);

  console.log("\n== assignRoom respects capacity ==");
  const s3 = await students.createStudent(mk("Roomless", null));
  let assignErr = null;
  try {
    await students.assignRoom(s3, single);
  } catch (e) {
    assignErr = e;
  }
  check("assign into full room rejected", assignErr instanceof students.RoomFullError);
  const stillNull = await students.getStudent(s3);
  check("student left unassigned", stillNull.roomId === null);

  console.log("\n== deleting a room detaches, never deletes students ==");
  const doubleRoom = await rooms.createRoom({
    branchId: "", block: "B", roomNumber: "2", floor: "", capacity: 2,
    rent: 7000, deposit: 0, amenities: "", notes: "",
  });
  await students.assignRoom(s3, doubleRoom);
  await rooms.deleteRoom(doubleRoom);
  const survivor = await students.getStudent(s3);
  check("student survived room deletion", survivor !== null);
  check("student detached from deleted room", survivor.roomId === null);

  console.log("\n== fee totals and payment arithmetic ==");
  const billRoom = await rooms.createRoom({
    branchId: "", block: "C", roomNumber: "3", floor: "", capacity: 3,
    rent: 6000, deposit: 0, amenities: "", notes: "",
  });
  const payer = await students.createStudent(mk("Paying Student", billRoom));
  const bill = await fees.createFee({
    studentId: payer, period: "2026-08", rent: 6000, electricity: 500, water: 200,
    other: 100, discount: 800, dueDate: "2026-08-10", note: "",
  });
  const created = await fees.getFee(bill);
  check("total = charges - discount", created.total === 6000, "total=" + created.total);
  check("starts unpaid", created.status === "unpaid" && created.amountPaid === 0);

  await fees.recordPayment(bill, 2000, "cash", "2026-08-02", "", "");
  let partial = await fees.getFee(bill);
  check("partial after first payment", partial.status === "partial", partial.status);
  check("balance is 4000", Math.round(partial.balance) === 4000, "balance=" + partial.balance);

  console.log("\n== overpayment is rejected, not clamped ==");
  let over = null;
  try {
    await fees.recordPayment(bill, 9999, "cash", "2026-08-03", "", "");
  } catch (e) {
    over = e;
  }
  check("overpayment rejected", over instanceof fees.OverpaymentError, over && over.message);
  const unchanged = await fees.getFee(bill);
  check("paid amount unchanged after rejection", unchanged.amountPaid === 2000, "paid=" + unchanged.amountPaid);
  const paymentsAfter = await fees.listPayments(bill);
  check("no stray payment row written", paymentsAfter.length === 1, "rows=" + paymentsAfter.length);

  let zero = null;
  try {
    await fees.recordPayment(bill, 0, "cash", "2026-08-03", "", "");
  } catch (e) {
    zero = e;
  }
  check("zero payment rejected", zero instanceof fees.OverpaymentError);

  console.log("\n== settling in instalments ==");
  await fees.recordPayment(bill, 4000, "upi", "2026-08-04", "TXN9", "");
  const settled = await fees.getFee(bill);
  check("marked paid at exactly the total", settled.status === "paid", settled.status);
  check("balance is zero", Math.abs(settled.balance) < 0.001, "balance=" + settled.balance);

  console.log("\n== reversing a payment restores the balance ==");
  const rows = await fees.listPayments(bill);
  check("both payments listed", rows.length === 2, "rows=" + rows.length);
  const bigPayment = rows.find((r) => r.amount === 4000);
  await fees.deletePayment(bigPayment.id);
  const reversed = await fees.getFee(bill);
  check("back to partial", reversed.status === "partial", reversed.status);
  check("balance restored by exactly the reversed amount", Math.round(reversed.balance) === 4000, "balance=" + reversed.balance);
  const remaining = await fees.listPayments(bill);
  check("only the other payment remains", remaining.length === 1 && remaining[0].amount === 2000, JSON.stringify(remaining.map((r) => r.amount)));

  console.log("\n== duplicate invoice for same student+month ==");
  let dup = null;
  try {
    await fees.createFee({
      studentId: payer, period: "2026-08", rent: 1, electricity: 0, water: 0,
      other: 0, discount: 0, dueDate: "2026-08-10", note: "",
    });
  } catch (e) {
    dup = e;
  }
  check("duplicate rejected", dup instanceof fees.DuplicateInvoiceError, dup && dup.message);

  console.log("\n== generateInvoices is safe to re-run ==");
  await students.createStudent(mk("Bulk A", billRoom));
  await students.createStudent(mk("Bulk B", billRoom));
  const first = await fees.generateInvoices("2026-09");
  const activeNow = (await students.studentCounts()).active;
  check("created one bill per active student", first.created === activeNow, "created=" + first.created + " active=" + activeNow);

  const second = await fees.generateInvoices("2026-09");
  check("re-run creates nothing", second.created === 0, "created=" + second.created);
  check("re-run reports everyone skipped", second.skipped === activeNow, "skipped=" + second.skipped);

  const sept = await fees.listFees("all", "2026-09", "");
  check("no duplicate september bills", sept.length === activeNow, "bills=" + sept.length);
  const roomPriced = sept.find((f) => f.studentName === "Bulk A");
  check("priced from the student's own rent", roomPriced.rent === 6000, "rent=" + roomPriced.rent);
  check("due 30 days into the period", roomPriced.dueDate === "2026-10-01", "due=" + roomPriced.dueDate);

  console.log("\n== per-student rent and cycle drive the bill ==");
  const bespokeRoom = await rooms.createRoom({
    branchId: "", block: "D", roomNumber: "9", floor: "", capacity: 2,
    rent: 6000, deposit: 0, amenities: "", notes: "",
  });
  const bespoke = await students.createStudent(
    mk("Bespoke Terms", bespokeRoom, { monthlyRent: 4500, billingCycleDays: 15 })
  );
  const bespokeRun = await fees.generateInvoices("2026-10");
  check("bespoke run created bills", bespokeRun.created > 0);
  const octBills = await fees.listFees("all", "2026-10", "");
  const bespokeBill = octBills.find((f) => f.studentName === "Bespoke Terms");
  check("uses the student's rent, not the room's", bespokeBill.rent === 4500, "rent=" + bespokeBill.rent);
  check("uses the student's 15-day cycle", bespokeBill.dueDate === "2026-10-16", "due=" + bespokeBill.dueDate);
  const normalBill = octBills.find((f) => f.studentName === "Bulk A");
  check("others keep their own 30-day cycle", normalBill.dueDate === "2026-10-31", "due=" + normalBill.dueDate);

  console.log("\n== dueDateFor ==");
  check("30 days from 1 Sep", fees.dueDateFor("2026-09") === "2026-10-01", fees.dueDateFor("2026-09"));
  check("defaults to 30 days", fees.DEFAULT_CYCLE_DAYS === 30);
  check("15-day cycle", fees.dueDateFor("2026-09", 15) === "2026-09-16", fees.dueDateFor("2026-09", 15));
  check("60-day cycle crosses two months", fees.dueDateFor("2026-09", 60) === "2026-10-31", fees.dueDateFor("2026-09", 60));
  check("bad cycle falls back to 30", fees.dueDateFor("2026-09", 0) === "2026-10-01", fees.dueDateFor("2026-09", 0));
  check("leap-year February", fees.dueDateFor("2028-02") === "2028-03-02", fees.dueDateFor("2028-02"));

  console.log("\n== due-for-reminder list ==");
  const due = await fees.listDueForReminder("2026-09-30");
  check("overdue list is non-empty", due.length > 0, "n=" + due.length);
  check("every entry has a balance", due.every((f) => f.balance > 0));
  check("excludes students who left", due.every((f) => f.studentName !== "First Student"));

  console.log("\n== money formatting (Indian grouping) ==");
  check("1234 -> 1,234", format.formatMoney(1234, "₹") === "₹1,234", format.formatMoney(1234, "₹"));
  check("123456 -> 1,23,456", format.formatMoney(123456, "₹") === "₹1,23,456", format.formatMoney(123456, "₹"));
  check("1234567 -> 12,34,567", format.formatMoney(1234567, "₹") === "₹12,34,567", format.formatMoney(1234567, "₹"));
  check("999 stays ungrouped", format.formatMoney(999, "₹") === "₹999");
  check("decimals kept when present", format.formatMoney(1234.5, "₹") === "₹1,234.50", format.formatMoney(1234.5, "₹"));
  check("negative handled", format.formatMoney(-1234, "₹") === "-₹1,234", format.formatMoney(-1234, "₹"));
  check("zero", format.formatMoney(0, "₹") === "₹0");

  console.log("\n== date helpers ==");
  check("toPeriod", format.toPeriod(new Date(2026, 7, 15)) === "2026-08");
  check("formatPeriod", format.formatPeriod("2026-08") === "August 2026");
  check("shiftPeriod forward", format.shiftPeriod("2026-11", 2) === "2027-01", format.shiftPeriod("2026-11", 2));
  check("shiftPeriod backward", format.shiftPeriod("2026-01", -1) === "2025-12", format.shiftPeriod("2026-01", -1));
  check("formatDate", format.formatDate("2026-08-14") === "14 Aug 2026", format.formatDate("2026-08-14"));
  check("initials two words", format.initials("Rahul Sharma") === "RS");
  check("initials one word", format.initials("Madonna") === "MA");
  check("initials empty", format.initials("   ") === "?");

  console.log("\n== phone normalisation for WhatsApp ==");
  const cc = "91";
  check("bare 10-digit gets country code", validate.toWhatsAppNumber("9876543210", cc) === "919876543210");
  check("already prefixed left alone", validate.toWhatsAppNumber("919876543210", cc) === "919876543210");
  check("spaces and dashes stripped", validate.toWhatsAppNumber("98765-43210", cc) === "919876543210");
  check("plus sign stripped", validate.toWhatsAppNumber("+91 98765 43210", cc) === "919876543210");
  check("trunk zero dropped", validate.toWhatsAppNumber("09876543210", cc) === "919876543210", validate.toWhatsAppNumber("09876543210", cc));
  check("too short rejected", validate.toWhatsAppNumber("123", cc) === null);
  check("empty rejected", validate.toWhatsAppNumber("", cc) === null);

  console.log("\n== csv escaping and injection guard ==");
  const rowsCsv = csv.toCsv(
    [
      { a: 'He said "hi"', b: "line1\nline2" },
      { a: "=SUM(A1:A9)", b: "plain, with comma" },
      { a: "@cmd", b: null },
    ],
    [
      { header: "A", value: (r) => r.a },
      { header: "B", value: (r) => r.b },
    ]
  );
  check("quotes doubled", rowsCsv.includes('"He said ""hi"""'), rowsCsv.split("\r\n")[1]);
  check("newline field quoted", rowsCsv.includes('"line1\nline2"'));
  check("formula neutralised", rowsCsv.includes("'=SUM(A1:A9)"), rowsCsv.split("\r\n")[2]);
  check("at-sign neutralised", rowsCsv.includes("'@cmd"));
  check("comma field quoted", rowsCsv.includes('"plain, with comma"'));
  check("null becomes empty", rowsCsv.split("\r\n")[3].endsWith(","), JSON.stringify(rowsCsv.split("\r\n")[3]));
  check("BOM present for Excel", rowsCsv.charCodeAt(0) === 0xfeff);

  console.log("\n== settings round trip ==");
  await settings.saveSettings({ hostelName: "Test Hostel", backupReminderDays: 15 });
  const loaded = await settings.loadSettings();
  check("saved value read back", loaded.hostelName === "Test Hostel" && loaded.backupReminderDays === 15);
  check("unset keys fall back to defaults", loaded.currencySymbol === "₹");
  await settings.saveSettings({ hostelName: "Renamed" });
  const reloaded = await settings.loadSettings();
  check("partial update preserves other keys", reloaded.hostelName === "Renamed" && reloaded.backupReminderDays === 15);

  // Installs that predate v3 still have defaultRent/feeDueDay rows on disk.
  // Those keys are gone from the app, and must be ignored rather than resurface.
  const rawDb = await (h.load("db")).getDb();
  await rawDb.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);", "defaultRent", "6000");
  await rawDb.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);", "feeDueDay", "10");
  const withStale = await settings.loadSettings();
  check("retired settings are ignored", withStale.defaultRent === undefined && withStale.feeDueDay === undefined, JSON.stringify(withStale));
  check("live settings still load alongside them", withStale.hostelName === "Renamed");

  console.log("\n== v1 -> v2 migration on an existing install ==");
  {
    const { DatabaseSync } = require("node:sqlite");
    const schema = h.load("db/schema");
    const legacy = new DatabaseSync(":memory:");

    // Stand up a database exactly as a v1 install would have left it.
    legacy.exec(schema.MIGRATIONS[1]);
    legacy.exec("PRAGMA user_version = 1;");
    legacy.prepare(
      "INSERT INTO students (id, fullName, createdAt, updatedAt) VALUES (?, ?, ?, ?);"
    ).run("legacy-1", "Existing Student", 1, 1);

    const hasNoticesBefore = legacy
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='notices';")
      .all()[0].n;
    check("v1 database has no notices table", hasNoticesBefore === 0);

    // Apply every migration the running app knows about, as getDb() does.
    let current = legacy.prepare("PRAGMA user_version;").all()[0].user_version;
    check("starts at version 1", current === 1, "v=" + current);
    while (current < schema.SCHEMA_VERSION) {
      const next = current + 1;
      legacy.exec(schema.MIGRATIONS[next]);
      legacy.exec("PRAGMA user_version = " + next + ";");
      current = next;
    }

    check("upgraded to current version", current === schema.SCHEMA_VERSION, "v=" + current);
    const hasNoticesAfter = legacy
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='notices';")
      .all()[0].n;
    check("notices table created by the migration", hasNoticesAfter === 1);

    const survivor = legacy.prepare("SELECT fullName FROM students WHERE id = ?;").all("legacy-1");
    check("existing student data survived the upgrade", survivor.length === 1 && survivor[0].fullName === "Existing Student");

    // The new table must be usable straight away, defaults included.
    legacy.prepare(
      "INSERT INTO notices (id, title, body, category, postedOn, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?);"
    ).run("n-legacy", "Post-upgrade notice", "body", "general", "2026-09-01", 2, 2);
    const inserted = legacy.prepare("SELECT pinned, lastSentAt FROM notices WHERE id = ?;").all("n-legacy")[0];
    check("pinned defaults to 0", inserted.pinned === 0, "pinned=" + inserted.pinned);
    check("lastSentAt defaults to null", inserted.lastSentAt === null);

    check("notices is included in backups", schema.BACKUP_TABLES.includes("notices"), schema.BACKUP_TABLES.join(","));

    // v3 moved rent onto the student; existing rows must be backfilled from
    // the room they occupy rather than silently dropping to zero.
    const cols = legacy.prepare("PRAGMA table_info(students);").all().map((c) => c.name);
    check("monthlyRent column added", cols.includes("monthlyRent"), cols.join(","));
    check("billingCycleDays column added", cols.includes("billingCycleDays"));

    const upgraded = legacy.prepare("SELECT monthlyRent, billingCycleDays FROM students WHERE id = ?;").all("legacy-1")[0];
    check("billing cycle defaults to 30 days", upgraded.billingCycleDays === 30, "cycle=" + upgraded.billingCycleDays);
    check("roomless student backfills to 0 rent", upgraded.monthlyRent === 0, "rent=" + upgraded.monthlyRent);

    legacy.close();
  }

  console.log("\n== v2 -> v3 backfills rent from the occupied room ==");
  {
    const { DatabaseSync } = require("node:sqlite");
    const schema = h.load("db/schema");
    const legacy = new DatabaseSync(":memory:");
    legacy.exec(schema.MIGRATIONS[1]);
    legacy.exec(schema.MIGRATIONS[2]);
    legacy.exec("PRAGMA user_version = 2;");

    legacy.prepare(
      "INSERT INTO rooms (id, block, roomNumber, capacity, rent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?);"
    ).run("r-1", "A", "101", 2, 7250, 1, 1);
    legacy.prepare(
      "INSERT INTO students (id, fullName, roomId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?);"
    ).run("s-roomed", "Roomed Student", "r-1", 1, 1);
    legacy.prepare(
      "INSERT INTO students (id, fullName, createdAt, updatedAt) VALUES (?, ?, ?, ?);"
    ).run("s-roomless", "Roomless Student", 1, 1);

    legacy.exec(schema.MIGRATIONS[3]);

    const roomed = legacy.prepare("SELECT monthlyRent, billingCycleDays FROM students WHERE id = ?;").all("s-roomed")[0];
    check("rent backfilled from the room", roomed.monthlyRent === 7250, "rent=" + roomed.monthlyRent);
    check("cycle defaults to 30", roomed.billingCycleDays === 30);

    const roomless = legacy.prepare("SELECT monthlyRent FROM students WHERE id = ?;").all("s-roomless")[0];
    check("roomless student left at 0 to be set by hand", roomless.monthlyRent === 0, "rent=" + roomless.monthlyRent);
    legacy.close();
  }

  console.log("\n== v3 -> v4 numbers existing students in arrival order ==");
  {
    const { DatabaseSync } = require("node:sqlite");
    const schema = h.load("db/schema");
    const legacy = new DatabaseSync(":memory:");
    legacy.exec(schema.MIGRATIONS[1]);
    legacy.exec(schema.MIGRATIONS[2]);
    legacy.exec(schema.MIGRATIONS[3]);
    legacy.exec("PRAGMA user_version = 3;");

    const add = (id, name, admissionNo, createdAt) =>
      legacy
        .prepare(
          "INSERT INTO students (id, fullName, admissionNo, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?);"
        )
        .run(id, name, admissionNo, createdAt, createdAt);

    add("s1", "First Joiner", "", 1000);
    add("s2", "Second Joiner", "", 2000);
    add("s3", "Already Numbered", "77", 3000);
    add("s4", "Text Number", "ADM/2026/09", 4000);

    legacy.exec(schema.MIGRATIONS[4]);

    const rows = legacy
      .prepare("SELECT id, admissionNo FROM students ORDER BY createdAt;")
      .all();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.admissionNo]));

    check("first joiner becomes 1", byId.s1 === "1", JSON.stringify(byId));
    check("second joiner becomes 2", byId.s2 === "2", JSON.stringify(byId));
    check("an existing numeric id is preserved", byId.s3 === "77", JSON.stringify(byId));
    check("a non-numeric id is replaced", byId.s4 !== "ADM/2026/09", JSON.stringify(byId));
    check("every student ends up numbered", rows.every((r) => /^[0-9]+$/.test(r.admissionNo)), JSON.stringify(byId));

    legacy.close();
  }

  console.log("\n== notices ==");
  const n1 = await notices.createNotice({
    branchId: null,
    title: "Water supply interrupted",
    body: "Water will be off on 12 Sep between 10am and 2pm.",
    category: "maintenance",
    pinned: false,
    postedOn: "2026-09-05",
  });
  const n2 = await notices.createNotice({
    branchId: null,
    title: "Independence Day event",
    body: "Cultural programme in the common hall.",
    category: "event",
    pinned: false,
    postedOn: "2026-08-14",
  });
  await notices.createNotice({
    branchId: null,
    title: "Mess menu change",
    body: "New menu effective from next week.",
    category: "general",
    pinned: false,
    postedOn: "2026-09-01",
  });

  const allNotices = await notices.listNotices("all");
  check("all notices listed", allNotices.length === 3, "n=" + allNotices.length);
  check("newest first by postedOn", allNotices[0].title === "Water supply interrupted", allNotices[0].title);

  const maintenance = await notices.listNotices("maintenance");
  check("category filter", maintenance.length === 1 && maintenance[0].id === n1);

  const nCounts = await notices.noticeCounts();
  check("counts by category", nCounts.all === 3 && nCounts.maintenance === 1 && nCounts.event === 1, JSON.stringify(nCounts));

  const searched = await notices.listNotices("all", "cultural");
  check("search matches body text", searched.length === 1 && searched[0].id === n2, "n=" + searched.length);

  console.log("\n== pinned notices sort to the top ==");
  await notices.togglePinned(n2, true);
  const pinnedFirst = await notices.listNotices("all");
  check("pinned rises above newer notices", pinnedFirst[0].id === n2, pinnedFirst[0].title);
  check("pinned flag is a real boolean", pinnedFirst[0].pinned === true, typeof pinnedFirst[0].pinned);
  check("unpinned stay false", pinnedFirst[1].pinned === false);
  await notices.togglePinned(n2, false);
  const unpinned = await notices.listNotices("all");
  check("unpinning restores date order", unpinned[0].id === n1);

  console.log("\n== notice -> whatsapp message ==");
  const msg = notices.noticeToMessage({ title: "Holiday Notice", body: "Hostel closed on 15 Aug." });
  check("keeps {{name}} placeholder for per-student merge", msg.includes("{{name}}"), msg);
  check("keeps {{hostel}} placeholder", msg.includes("{{hostel}}"));
  check("title is bold for whatsapp", msg.includes("*Holiday Notice*"), msg);
  check("body included", msg.includes("Hostel closed on 15 Aug."));

  const rendered = messaging.renderTemplate(msg, { name: "Rahul Sharma", hostel: "Green Valley" });
  check("placeholders resolve at send time", rendered.includes("Dear Rahul Sharma") && rendered.includes("- Green Valley"), rendered);
  check("no placeholders left behind", !rendered.includes("{{"), rendered);

  console.log("\n== sent stamp ==");
  const beforeSend = await notices.getNotice(n1);
  check("starts unsent", beforeSend.lastSentAt === null);
  await notices.markNoticeSent(n1);
  const afterSend = await notices.getNotice(n1);
  check("stamped after sending", typeof afterSend.lastSentAt === "number" && afterSend.lastSentAt > 0);

  console.log("\n== notice edit and delete ==");
  await notices.updateNotice(n1, {
    branchId: null,
    title: "Water supply restored",
    body: "Supply is back to normal.",
    category: "general",
    pinned: false,
    postedOn: "2026-09-06",
  });
  const edited = await notices.getNotice(n1);
  check("edit persists", edited.title === "Water supply restored" && edited.category === "general");
  check("sent stamp survives an edit", edited.lastSentAt !== null);

  await notices.deleteNotice(n1);
  check("deleted", (await notices.getNotice(n1)) === null);
  check("others untouched", (await notices.listNotices("all")).length === 2);

  console.log("\n== saving a captured photo ==");
  {
    const SRC = "file:///cache/camera-shot.jpg";
    const bytes = Buffer.from("pretend-jpeg-bytes-éñ-12345");
    h.files.set(SRC, bytes);

    const stored = await photos.savePhoto(SRC);
    check("returns a bare filename, not a uri", /^[0-9a-f-]+\.jpg$/i.test(stored), stored);
    check("no path separators in the stored name", !stored.includes("/"), stored);

    const uri = photos.photoUri(stored);
    check("photoUri resolves to an existing file", typeof uri === "string" && uri.length > 0, String(uri));
    check("file lives under the photos directory", uri.includes("/photos/"), String(uri));

    const roundTrip = await photos.readPhotoBase64(stored);
    check("stored bytes match what was captured", roundTrip === bytes.toString("base64"));

    const leftovers = [...h.files.keys()].filter((k) => k.includes("manip-"));
    check("manipulator temp file cleaned up", leftovers.length === 0, leftovers.join(","));

    console.log("\n== a saved photo survives being referenced by a student ==");
    const photoRoom = await rooms.createRoom({
      branchId: "", block: "P", roomNumber: "1", floor: "", capacity: 2,
      rent: 1000, deposit: 0, amenities: "", notes: "",
    });
    const withPhoto = await students.createStudent(
      mk("Photographed", photoRoom, { admissionNo: "", photoFile: stored })
    );
    const saved = await students.getStudent(withPhoto);
    check("student row keeps the filename", saved.photoFile === stored, String(saved.photoFile));
    check("and the file is still on disk", photos.photoUri(saved.photoFile) !== null);

    console.log("\n== replacing a photo removes only the old file ==");
    h.files.set(SRC, Buffer.from("second-shot"));
    const replacement = await photos.savePhoto(SRC);
    check("replacement is a different file", replacement !== stored);
    await students.updateStudent(
      withPhoto,
      mk("Photographed", photoRoom, { admissionNo: saved.admissionNo, photoFile: replacement })
    );
    check("old photo deleted", photos.photoUri(stored) === null);
    check("new photo retained", photos.photoUri(replacement) !== null);

    console.log("\n== deleting a student removes its photo ==");
    await students.deleteStudent(withPhoto);
    check("photo cleaned up with the student", photos.photoUri(replacement) === null);

    console.log("\n== photoUri is safe on missing or absent files ==");
    check("null filename", photos.photoUri(null) === null);
    check("empty filename", photos.photoUri("") === null);
    check("unknown filename", photos.photoUri("does-not-exist.jpg") === null);
    check("deletePhoto tolerates a missing file", (photos.deletePhoto("nope.jpg"), true));

    await rooms.deleteRoom(photoRoom);
  }

  console.log("\n== admission numbers are a sequence ==");
  {
    const seqRoom = await rooms.createRoom({
      branchId: "", block: "S", roomNumber: "1", floor: "", capacity: 5,
      rent: 5000, deposit: 0, amenities: "", notes: "",
    });

    const before = await students.peekNextAdmissionNo();
    const a = await students.createStudent(mk("Seq One", seqRoom, { admissionNo: "" }));
    const b = await students.createStudent(mk("Seq Two", seqRoom, { admissionNo: "" }));
    const c = await students.createStudent(mk("Seq Three", null, { admissionNo: "" }));

    const ga = await students.getStudent(a);
    const gb = await students.getStudent(b);
    const gc = await students.getStudent(c);

    check("preview matched the number actually issued", ga.admissionNo === before, before + " vs " + ga.admissionNo);
    check("numbers increment by one", Number(gb.admissionNo) === Number(ga.admissionNo) + 1, ga.admissionNo + "," + gb.admissionNo);
    check("and again", Number(gc.admissionNo) === Number(gb.admissionNo) + 1, gc.admissionNo);
    check("numbers are plain integers", /^[0-9]+$/.test(ga.admissionNo), ga.admissionNo);

    console.log("\n== numbers are not reused after a deletion ==");
    const highest = Number(gc.admissionNo);
    await students.deleteStudent(c);
    const d = await students.createStudent(mk("Seq Four", null, { admissionNo: "" }));
    const gd = await students.getStudent(d);
    check("deleted student's number is not reused", Number(gd.admissionNo) === highest + 1, "got " + gd.admissionNo);

    console.log("\n== editing a student keeps its number ==");
    await students.updateStudent(a, mk("Seq One Renamed", seqRoom, { admissionNo: ga.admissionNo }));
    const reread = await students.getStudent(a);
    check("number survives an edit", reread.admissionNo === ga.admissionNo, reread.admissionNo);
    check("rename applied", reread.fullName === "Seq One Renamed");

    console.log("\n== an explicit number is respected ==");
    const e = await students.createStudent(mk("Explicit", null, { admissionNo: "900" }));
    const ge = await students.getStudent(e);
    check("explicit number kept", ge.admissionNo === "900", ge.admissionNo);
    const f = await students.createStudent(mk("After Explicit", null, { admissionNo: "" }));
    const gf = await students.getStudent(f);
    check("sequence continues from the highest", gf.admissionNo === "901", gf.admissionNo);

    // Tidy up so later assertions on counts stay predictable.
    for (const id of [a, b, d, e, f]) await students.deleteStudent(id);
    await rooms.deleteRoom(seqRoom);
  }

  console.log("\n== moving an existing student between rooms ==");
  {
    const roomX = await rooms.createRoom({
      branchId: "", block: "X", roomNumber: "1", floor: "", capacity: 1,
      rent: 5000, deposit: 0, amenities: "", notes: "",
    });
    const roomY = await rooms.createRoom({
      branchId: "", block: "Y", roomNumber: "1", floor: "", capacity: 2,
      rent: 8000, deposit: 0, amenities: "", notes: "",
    });

    const mover = await students.createStudent(
      mk("Mover", roomX, { admissionNo: "", monthlyRent: 5000 })
    );
    check("starts in room X", (await students.getStudent(mover)).roomLabel === "X-1");

    await students.assignRoom(mover, roomY);
    const moved = await students.getStudent(mover);
    check("moved to room Y", moved.roomLabel === "Y-1", moved.roomLabel);
    check("rent is NOT changed by the move", moved.monthlyRent === 5000, "rent=" + moved.monthlyRent);

    const xAfter = await rooms.getRoom(roomX);
    const yAfter = await rooms.getRoom(roomY);
    check("old room freed the bed", xAfter.occupied === 0 && xAfter.vacant === 1);
    check("new room counts the occupant", yAfter.occupied === 1);

    console.log("\n== rent can be updated explicitly after a move ==");
    await students.setStudentRent(mover, 8000);
    const repriced = await students.getStudent(mover);
    check("rent updated on request", repriced.monthlyRent === 8000, "rent=" + repriced.monthlyRent);
    check("room unchanged by repricing", repriced.roomLabel === "Y-1");

    console.log("\n== moving into a full room is refused ==");
    const blocker = await students.createStudent(mk("Blocker", roomX, { admissionNo: "" }));
    const spare = await students.createStudent(mk("Spare", null, { admissionNo: "" }));
    let moveErr = null;
    try {
      await students.assignRoom(spare, roomX);
    } catch (e) {
      moveErr = e;
    }
    check("full room rejects the move", moveErr instanceof students.RoomFullError, moveErr && moveErr.message);
    check("student stays where they were", (await students.getStudent(spare)).roomId === null);

    for (const id of [mover, blocker, spare]) await students.deleteStudent(id);
    await rooms.deleteRoom(roomX);
    await rooms.deleteRoom(roomY);
  }

  console.log("\n== the two branches are seeded ==");
  {
    const all = await branches.listBranches();
    check("both branches exist", all.length === 2, all.map((b) => b.name).join(" | "));
    const tham = all.find((b) => b.id === "branch-thammanam");
    const kann = all.find((b) => b.id === "branch-kannanad");
    check("Thammanam named in full", tham.name === "Thammanam - Royal Boys Hostel", tham.name);
    check("Kannanad named in full", kann.name === "Kannanad - Royal Boys Hostel", kann.name);
    check("letters are T and K", tham.code === "T" && kann.code === "K", tham.code + "/" + kann.code);

    console.log("\n== inmate ids are prefixed with the branch letter ==");
    check("T-14", branches.formatInmateId("T", "14") === "T-14");
    check("K-1", branches.formatInmateId("K", "1") === "K-1");
    check("no letter falls back to the bare number", branches.formatInmateId(null, "9") === "9");
    check("no id shows a dash", branches.formatInmateId("T", "") === "—");
  }

  console.log("\n== a branch only sees its own records ==");
  {
    branches.setActiveBranchId("branch-thammanam");
    const tRoom = await rooms.createRoom({
      branchId: "", block: "T", roomNumber: "1", floor: "", capacity: 4,
      rent: 5000, deposit: 0, amenities: "", notes: "",
    });
    const tOne = await students.createStudent(mk("Thammanam Resident", tRoom, { admissionNo: "" }));

    branches.setActiveBranchId("branch-kannanad");
    const kRoom = await rooms.createRoom({
      branchId: "", block: "K", roomNumber: "1", floor: "", capacity: 4,
      rent: 6000, deposit: 0, amenities: "", notes: "",
    });
    const kOne = await students.createStudent(mk("Kannanad Resident", kRoom, { admissionNo: "" }));

    const kList = await students.listStudents("", "all");
    check("Kannanad list excludes Thammanam inmates",
      kList.every((s) => s.fullName !== "Thammanam Resident"),
      kList.map((s) => s.fullName).join(","));
    check("Kannanad list includes its own", kList.some((s) => s.fullName === "Kannanad Resident"));

    const kRooms = await rooms.listRooms();
    check("Kannanad rooms exclude Thammanam rooms",
      kRooms.every((r) => r.block !== "T"), kRooms.map((r) => r.block + r.roomNumber).join(","));

    branches.setActiveBranchId("branch-thammanam");
    const tList = await students.listStudents("", "all");
    check("Thammanam list excludes Kannanad inmates",
      tList.every((s) => s.fullName !== "Kannanad Resident"),
      tList.map((s) => s.fullName).join(","));

    console.log("\n== numbering restarts in each branch ==");
    const t = await students.getStudent(tOne);
    const k = await students.getStudent(kOne);
    check("Thammanam inmate carries the T code", t.branchCode === "T", String(t.branchCode));
    check("Kannanad inmate carries the K code", k.branchCode === "K", String(k.branchCode));
    check("both branches issued number 1", k.admissionNo === "1", "K number was " + k.admissionNo);
    check("ids only differ by branch letter",
      branches.formatInmateId(t.branchCode, t.admissionNo) !== branches.formatInmateId(k.branchCode, k.admissionNo),
      branches.formatInmateId(t.branchCode, t.admissionNo) + " vs " + branches.formatInmateId(k.branchCode, k.admissionNo));

    branches.setActiveBranchId("branch-kannanad");
    const kSecond = await students.createStudent(mk("Kannanad Second", null, { admissionNo: "" }));
    check("Kannanad continues its own sequence",
      (await students.getStudent(kSecond)).admissionNo === "2",
      (await students.getStudent(kSecond)).admissionNo);

    console.log("\n== occupancy and counts are per branch ==");
    const kOcc = await rooms.occupancyTotals();
    check("Kannanad counts only its beds", kOcc.beds === 4, "beds=" + kOcc.beds);
    const kCounts = await students.studentCounts();
    check("Kannanad counts only its inmates", kCounts.total === 2, "total=" + kCounts.total);

    console.log("\n== fees are scoped through the inmate ==");
    await fees.createFee({
      studentId: kOne, period: "2027-01", rent: 6000, electricity: 0, water: 0,
      other: 0, discount: 0, dueDate: "2027-01-31", note: "",
    });
    const kFees = await fees.listFees("all", "2027-01", "");
    check("Kannanad sees its own bill", kFees.length === 1 && kFees[0].studentName === "Kannanad Resident");

    branches.setActiveBranchId("branch-thammanam");
    const tFees = await fees.listFees("all", "2027-01", "");
    check("Thammanam does not see Kannanad's bill", tFees.length === 0, "n=" + tFees.length);
    const tTotals = await fees.feeTotals("2027-01");
    check("totals exclude the other branch", tTotals.billed === 0, "billed=" + tTotals.billed);

    console.log("\n== raising bills only touches the active branch ==");
    const raised = await fees.generateInvoices("2027-02");
    const tFeb = await fees.listFees("all", "2027-02", "");
    check("bills raised for Thammanam only",
      tFeb.every((f) => f.studentName !== "Kannanad Resident"),
      tFeb.map((f) => f.studentName).join(","));
    check("something was raised", raised.created > 0, "created=" + raised.created);
    branches.setActiveBranchId("branch-kannanad");
    const kFeb = await fees.listFees("all", "2027-02", "");
    check("Kannanad got no February bills", kFeb.length === 0, "n=" + kFeb.length);

    console.log("\n== moving an inmate between branches ==");
    branches.setActiveBranchId("branch-thammanam");
    const movedId = (await students.getStudent(tOne)).admissionNo;
    await students.moveToBranch(tOne, "branch-kannanad");
    const afterT = await students.listStudents("", "all");
    check("gone from the old branch", afterT.every((s) => s.id !== tOne));
    branches.setActiveBranchId("branch-kannanad");
    const afterK = await students.getStudent(tOne);
    check("now in the new branch", afterK !== null && afterK.branchCode === "K", String(afterK && afterK.branchCode));
    check("keeps the id it was issued", afterK.admissionNo === movedId, afterK.admissionNo);
    check("bed released on the move", afterK.roomId === null);

    branches.setActiveBranchId("branch-thammanam");
  }

  console.log("\n== notices: per branch, or shared ==");
  {
    branches.setActiveBranchId("branch-thammanam");
    await notices.createNotice({
      branchId: "branch-thammanam", title: "Thammanam only", body: "Local notice",
      category: "general", pinned: false, postedOn: "2027-01-05",
    });
    await notices.createNotice({
      branchId: null, title: "Both branches", body: "Festival holiday",
      category: "event", pinned: false, postedOn: "2027-01-06",
    });

    const tBoard = await notices.listNotices("all");
    check("Thammanam sees its own notice", tBoard.some((n) => n.title === "Thammanam only"));
    check("Thammanam sees the shared notice", tBoard.some((n) => n.title === "Both branches"));

    branches.setActiveBranchId("branch-kannanad");
    const kBoard = await notices.listNotices("all");
    check("Kannanad does NOT see the other branch's notice",
      kBoard.every((n) => n.title !== "Thammanam only"),
      kBoard.map((n) => n.title).join(","));
    check("Kannanad does see the shared notice", kBoard.some((n) => n.title === "Both branches"));

    const kCounts = await notices.noticeCounts();
    const kTitles = kBoard.map((n) => n.title);
    check("counts match the visible board", kCounts.all === kTitles.length, kCounts.all + " vs " + kTitles.length);

    branches.setActiveBranchId("branch-thammanam");
  }

  console.log("\n== search and filters ==");
  const byName = await students.listStudents("bulk", "active");
  check("search matches name fragment", byName.length === 2, "n=" + byName.length);
  const unassigned = await students.listStudents("", "unassigned");
  check("unassigned filter", unassigned.every((s) => s.roomId === null && s.status === "active"));
  const left = await students.listStudents("", "left");
  check("left filter", left.length === 1 && left[0].fullName === "First Student", JSON.stringify(left.map((s) => s.fullName)));

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error("\nHARNESS ERROR:", e);
  process.exit(1);
});
