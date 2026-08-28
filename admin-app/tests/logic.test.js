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
const format = h.load("utils/format");
const validate = h.load("utils/validate");
const csv = h.load("services/csv");

const mk = (name, roomId, extra) =>
  Object.assign(
    {
      admissionNo: "", fullName: name, phone: "9876500000", guardianName: "", guardianPhone: "",
      email: "", course: "", year: "", address: "", idProof: "", photoFile: null,
      roomId: roomId ?? null, status: "active", joinedOn: "2026-01-01", leftOn: null, notes: "",
    },
    extra || {}
  );

async function run() {
  console.log("== room capacity is enforced ==");
  const single = await rooms.createRoom({
    block: "A", roomNumber: "1", floor: "", capacity: 1,
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
    block: "B", roomNumber: "2", floor: "", capacity: 2,
    rent: 7000, deposit: 0, amenities: "", notes: "",
  });
  await students.assignRoom(s3, doubleRoom);
  await rooms.deleteRoom(doubleRoom);
  const survivor = await students.getStudent(s3);
  check("student survived room deletion", survivor !== null);
  check("student detached from deleted room", survivor.roomId === null);

  console.log("\n== fee totals and payment arithmetic ==");
  const billRoom = await rooms.createRoom({
    block: "C", roomNumber: "3", floor: "", capacity: 3,
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
  const first = await fees.generateInvoices("2026-09", "2026-09-10", 4444);
  const activeNow = (await students.studentCounts()).active;
  check("created one bill per active student", first.created === activeNow, "created=" + first.created + " active=" + activeNow);

  const second = await fees.generateInvoices("2026-09", "2026-09-10", 4444);
  check("re-run creates nothing", second.created === 0, "created=" + second.created);
  check("re-run reports everyone skipped", second.skipped === activeNow, "skipped=" + second.skipped);

  const sept = await fees.listFees("all", "2026-09", "");
  check("no duplicate september bills", sept.length === activeNow, "bills=" + sept.length);
  const roomPriced = sept.find((f) => f.studentName === "Bulk A");
  check("priced from the room rent", roomPriced.rent === 6000, "rent=" + roomPriced.rent);
  const fallbackPriced = sept.find((f) => f.studentName === "Roomless");
  check("roomless student uses fallback rent", fallbackPriced.rent === 4444, "rent=" + fallbackPriced.rent);

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
  await settings.saveSettings({ hostelName: "Test Hostel", feeDueDay: 15 });
  const loaded = await settings.loadSettings();
  check("saved value read back", loaded.hostelName === "Test Hostel" && loaded.feeDueDay === 15);
  check("unset keys fall back to defaults", loaded.currencySymbol === "₹");
  await settings.saveSettings({ hostelName: "Renamed" });
  const reloaded = await settings.loadSettings();
  check("partial update preserves other keys", reloaded.hostelName === "Renamed" && reloaded.feeDueDay === 15);

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
