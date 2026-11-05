/* Service tests against the Claude storage stand-in, including two devices
   racing for the same bed, admission number and bill balance. */
const { SharedStore, device, settle, OWNER } = require("./harness");

const WARDEN = { id: "u_warden000000000000002", name: "Warden", isOwner: false, canEdit: true, canWrite: true };
const VIEWER = { id: "u_viewer000000000000003", name: "Viewer", isOwner: false, canEdit: false, canWrite: false };
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
const rejects = async (promise, ErrorType) => {
  try {
    await promise;
    return false;
  } catch (error) {
    return ErrorType ? error instanceof ErrorType : true;
  }
};

const inmate = (name, roomId, extra = {}) => ({
  admissionNo: "", fullName: name, phone: "9876500000", guardianName: "", guardianPhone: "",
  email: "", course: "", year: "", address: "", idProof: "", photoFile: null, idProofFile: null,
  idProofBackFile: null, roomId: roomId ?? null, branchId: "", status: "active", monthlyRent: 6000,
  billingCycleDays: 30, admissionType: "monthly", stayDays: null, joinedOn: "2026-01-15", leftOn: null, notes: "",
  ...extra,
});
const room = (number, capacity, rent = 5000) => ({
  branchId: "", block: "A", roomNumber: number, floor: "", capacity, rent, deposit: 0, amenities: "", notes: "",
});

async function fresh(user = OWNER) {
  const store = new SharedStore();
  const app = await device(store, user);
  await app.branches.seedBranches();
  await app.messaging.seedTemplates();
  app.branches.setActiveBranchId(T);
  return { store, app };
}

async function pureLogic() {
  console.log("Pure logic");
  const { app } = await fresh();
  const { fees, format, validate, messaging, notices, csv } = app;
  check("due date follows the join day", fees.dueDateFor("2026-02", fees.anchorDayFor("2026-01-31")) === "2026-02-28");
  check("stay due date adds the stay length", fees.stayDueDateFor("2026-01-30", 3) === "2026-02-02");
  check("money in Indian format", format.formatMoney(1234567, "₹") === "₹12,34,567");
  check("dates shown day first", format.toDisplayDate("2026-08-14") === "14-08-2026");
  check("dates typed day first are read", format.fromDisplayDate("14-08-2026") === "2026-08-14" && format.fromDisplayDate("4/8/26") === "2026-08-04");
  check("an impossible typed date is refused", format.fromDisplayDate("31-02-2026") === null && format.fromDisplayDate("2026-08-14") === null && format.fromDisplayDate("14-08") === null);
  check("phone normalised for wa.me", validate.toWhatsAppNumber("98765 43210", "91") === "919876543210");
  check("template placeholders merge", messaging.renderTemplate("Hi {{first_name}}, {{room}}", { name: "Arjun Menon", room: "A-1" }) === "Hi Arjun, A-1");
  check("notice keeps placeholders", notices.noticeToMessage({ title: "T", body: "B" }).includes("{{name}}"));
  const out = csv.toCsv([{ a: "=SUM(1)", b: 'x,"y"' }], [{ header: "A", value: (r) => r.a }, { header: "B", value: (r) => r.b }]);
  check("CSV guards formulas and quotes commas", out.includes("'=SUM(1)") && out.includes('"x,""y"""'));

  {
    const { unzipSync, strFromU8 } = require("fflate");
    const bytes = app.xlsx.toXlsx("Inmates / 2026", [{ n: "Arun <K>", rent: 6000, note: "=SUM(1)" }, { n: "Bala", rent: 4500.5, note: null }], [
      { header: "Name", value: (r) => r.n },
      { header: "Rent", value: (r) => r.rent },
      { header: "Note", value: (r) => r.note },
    ]);
    const files = unzipSync(bytes);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    check("an Excel report is a real workbook", bytes[0] === 0x50 && bytes[1] === 0x4b && Boolean(files["[Content_Types].xml"]) && Boolean(files["xl/styles.xml"]));
    check("its header row is styled and frozen", sheet.includes('<c r="A1" s="1"') && sheet.includes('state="frozen"') && sheet.includes('<autoFilter ref="A1:C3"/>'));
    check("numbers are stored as numbers, so Excel can total them", sheet.includes('<c r="B2" s="0"><v>6000</v></c>') && sheet.includes("<v>4500.5</v>"));
    check("text is stored as text, so it can never run as a formula", sheet.includes('<c r="C2" s="0" t="inlineStr"><is><t xml:space="preserve">=SUM(1)</t>'));
    check("special characters are escaped", sheet.includes("Arun &lt;K&gt;"));
    check("the tab name drops characters Excel refuses", strFromU8(files["xl/workbook.xml"]).includes('name="Inmates   2026"'));
  }
}

async function singleDevice() {
  console.log("One device");
  const { store, app } = await fresh();
  const { rooms, inmates, fees, branches, complaints, notices, messaging, cloud, views } = app;

  check("two branches seeded", (await branches.listBranches()).length === 2);
  check("five built-in templates seeded", (await messaging.listTemplates()).length === 5);
  await branches.seedBranches();
  await messaging.seedTemplates();
  check("seeding again adds nothing", store.query("branches", []).length === 2 && store.query("templates", []).length === 5);

  const r1 = await rooms.createRoom(room("101", 1));
  const a = await inmates.createInmate(inmate("Arjun", r1));
  const b = await inmates.createInmate(inmate("Bala", null));
  const typed = await inmates.createInmate(inmate("Chris", null, { admissionNo: "50" }));
  check("admission numbers issued 1, 2", (await inmates.getInmate(a)).admissionNo === "1" && (await inmates.getInmate(b)).admissionNo === "2");
  check("a typed admission number is kept", (await inmates.getInmate(typed)).admissionNo === "50");
  check("next number continues past the highest", (await inmates.peekNextAdmissionNo()) === "51");

  check("a full room refuses another inmate", await rejects(inmates.createInmate(inmate("Dev", r1)), inmates.RoomFullError));
  check("assigning into a full room is refused", await rejects(inmates.assignRoom(b, r1), inmates.RoomFullError));
  await inmates.markLeft(a);
  await inmates.assignRoom(b, r1);
  check("leaving frees the bed", (await inmates.getInmate(b)).roomId === r1 && (await rooms.getRoom(r1)).occupied === 1);

  branches.setActiveBranchId(K);
  const kRoom = await rooms.createRoom(room("201", 2));
  await inmates.createInmate(inmate("Kiran", kRoom));
  check("numbering restarts per branch", (await inmates.listInmates("", "all"))[0].admissionNo === "1");
  const shared = await notices.createNotice({ branchId: null, title: "Water cut", body: "", category: "general", pinned: true, postedOn: "" });
  await notices.createNotice({ branchId: K, title: "K only", body: "", category: "general", pinned: false, postedOn: "" });
  branches.setActiveBranchId(T);
  const tNames = (await inmates.listInmates("", "all")).map((i) => i.fullName);
  check("branches do not see each other's inmates", !tNames.includes("Kiran") && tNames.includes("Bala"));
  check("branches do not see each other's rooms", (await rooms.listRooms()).length === 1);
  const tNotices = (await notices.listNotices()).map((n) => n.id);
  check("shared notices show on both boards", tNotices.includes(shared) && tNotices.length === 1);

  // One building of a hostel. Thammanam is Pushpamangalam and Royal House;
  // a room is in a building by its block, an inmate by their room.
  {
    const { views } = app;
    const before = { rooms: (await rooms.listRooms()).length, inmates: (await inmates.listInmates("", "all")).length };
    const pRoom = await rooms.createRoom({ ...room("101", 2), block: "PUSHPAMANGLAM" });
    const rRoom = await rooms.createRoom({ ...room("101", 3), block: "Royal House" });
    const pInmate = await inmates.createInmate(inmate("In Pushpa", pRoom));
    const rInmate = await inmates.createInmate(inmate("In Royal", rRoom));
    const names = async () => (await inmates.listInmates("", "all")).map((i) => i.fullName);

    check("a building's name matches despite a spelling slip", views.isHouse("PUSHPAMANGLAM", "Pushpamangalam") && !views.isHouse("A", "Pushpamangalam") && !views.isHouse("", "Royal House"));
    check("a long building name is shortened in room labels", (await rooms.getRoom(pRoom)) && views.roomLabelOf({ block: "PUSHPAMANGLAM", roomNumber: "101" }) === "P-101" && views.roomLabelOf({ block: "Royal House", roomNumber: "101" }) === "RH-101");
    check("a short block is left as it is", views.roomLabelOf({ block: "A", roomNumber: "7" }) === "A-7" && views.roomLabelOf({ block: "", roomNumber: "7" }) === "7");

    // Everyone in the hostel with no room yet shows in every building.
    const roomless = (await inmates.listInmates("", "all")).filter((i) => !i.roomId);
    const noRoom = roomless.map((i) => i.fullName);
    const roomlessIds = new Set(roomless.map((i) => i.id));
    const branchOf = (await inmates.getInmate(rInmate)).branchId;
    views.setActiveHouse("Royal House", branchOf);
    const royalRooms = await rooms.listRooms();
    check("one building: only its rooms", royalRooms.length === 1 && royalRooms[0].id === rRoom);
    check("one building: its inmates, and those with no room yet", JSON.stringify((await names()).sort()) === JSON.stringify(["In Royal", ...noRoom].sort()), JSON.stringify(await names()));
    check("an inmate in the other building is not shown", !(await names()).includes("In Pushpa"));
    check("one building: occupancy counts only its beds", (await rooms.occupancyTotals()).beds === 3 && (await rooms.occupancyTotals()).occupied === 1);
    check("one building: its bills, and those of inmates with no room", (await fees.listFees("all", null)).every((fee) => fee.studentId === rInmate || roomlessIds.has(fee.studentId)) && (await fees.listFees("all", null)).some((fee) => fee.studentId === rInmate));
    check("one building: no bill of the other building", !(await fees.listFees("all", null)).some((fee) => fee.studentId === pInmate));

    views.setActiveHouse("Pushpamangalam", branchOf);
    check("the other building shows the other inmate", JSON.stringify((await names()).sort()) === JSON.stringify(["In Pushpa", ...noRoom].sort()));
    views.setActiveHouse("Pushpamangalam", "some-other-hostel");
    check("someone with no room in another hostel is not shown", roomless.length > 0 && !views.allInmates().some((i) => roomlessIds.has(i.id)));
    check("a record opens by its id whichever building is showing", (await inmates.getInmate(rInmate)) !== null && (await rooms.getRoom(rRoom)).occupied === 1);

    views.setActiveHouse(null);
    check("the whole hostel shows both buildings and everyone else", (await rooms.listRooms()).length === before.rooms + 2 && (await inmates.listInmates("", "all")).length === before.inmates + 2);

    // Left as found, so the checks below count what they always counted.
    await inmates.deleteInmate(pInmate);
    await inmates.deleteInmate(rInmate);
    await rooms.deleteRoom(pRoom);
    await rooms.deleteRoom(rRoom);
  }

  // Fees
  const billId = await fees.createFee({ studentId: b, period: "2026-03", rent: 5000, electricity: 200, water: 0, other: 0, discount: 200, dueDate: "2026-03-15", note: "" });
  check("bill total is rent + charges - discount", (await fees.getFee(billId)).total === 5000);
  check("duplicate bill for the same month refused", await rejects(fees.createFee({ studentId: b, period: "2026-03", rent: 1, electricity: 0, water: 0, other: 0, discount: 0, dueDate: "", note: "" }), fees.DuplicateInvoiceError));
  check("bills are grouped per inmate per year", store.docs.has(`fees/${b}_2026`));

  await fees.recordPayment(billId, 2000, "cash", "2026-03-10", "", "");
  let bill = await fees.getFee(billId);
  check("part payment marks the bill partial", bill.status === "partial" && bill.balance === 3000);
  check("overpayment refused", await rejects(fees.recordPayment(billId, 3500, "cash", "2026-03-11", "", ""), fees.OverpaymentError));
  const [payment] = await fees.listPayments(billId);
  await fees.deletePayment(payment.id);
  bill = await fees.getFee(billId);
  check("reversing a payment restores the balance", bill.status === "unpaid" && bill.balance === 5000);

  // Part payment with a promised date for the balance. The bill fell due on
  // 2026-03-15, long past, so without a promise it is overdue.
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const two = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  };
  const today = day(0);
  const has = (list) => list.some((fee) => fee.id === billId);
  const inBucket = async (key) => {
    const group = fees.groupDues(await fees.listAllDues()).find((g) => g.key === key);
    return Boolean(group) && has(group.fees);
  };

  check("an unpaid bill past its due date is overdue", has(await fees.listDueForReminder(today)) && (await inBucket("overdue")));
  check("a promised date in the past is refused", await rejects(fees.recordPayment(billId, 1000, "cash", today, "", "", day(-1)), fees.OverpaymentError));
  check("a badly written promised date is refused", await rejects(fees.recordPayment(billId, 1000, "cash", today, "", "", "20-10-2026"), fees.OverpaymentError));
  check("a date that does not exist is refused", fees.promiseDateProblem("2026-02-31") !== null);
  check("a promise more than six months away is refused", fees.promiseDateProblem(day(200)) !== null);
  check("today is accepted as a promised date", fees.promiseDateProblem(today) === null);
  check("a refused payment takes no money", (await fees.getFee(billId)).balance === 5000);

  await fees.recordPayment(billId, 2000, "cash", today, "", "", day(5));
  bill = await fees.getFee(billId);
  check("a part payment keeps the promised date", bill.status === "partial" && bill.balance === 3000 && bill.promisedDate === day(5));
  check("the original due date is untouched", bill.dueDate === "2026-03-15" && bill.chaseDate === day(5));
  check("a promised bill leaves the reminder queue", !has(await fees.listDueForReminder(today)));
  check("it comes back on the promised day", has(await fees.listDueForReminder(day(5))));
  check("it is listed under this week, not overdue", (await inBucket("week")) && !(await inBucket("overdue")));
  check("its label says when the balance is promised", fees.dueLabel(bill) === "promised in 5 days", fees.dueLabel(bill));

  await fees.setPromiseDate(billId, day(1));
  bill = await fees.getFee(billId);
  check("the promised date can be moved", bill.promisedDate === day(1) && (await inBucket("tomorrow")));
  check("moving it to a past date is refused", await rejects(fees.setPromiseDate(billId, day(-3)), fees.OverpaymentError));

  await fees.recordPayment(billId, 500, "cash", today, "", "");
  check("a further part payment without a new date keeps the promise", (await fees.getFee(billId)).promisedDate === day(1));

  await fees.setPromiseDate(billId, null);
  bill = await fees.getFee(billId);
  check("removing the promise returns the bill to its due date", !bill.promisedDate && bill.chaseDate === "2026-03-15" && (await inBucket("overdue")));

  await fees.recordPayment(billId, 500, "cash", today, "", "", day(3));
  await fees.recordPayment(billId, 2000, "cash", today, "", "", day(9));
  bill = await fees.getFee(billId);
  check("settling the bill clears the promise", bill.status === "paid" && !bill.promisedDate && fees.dueLabel(bill) === "");
  check("a settled bill is not chased", !has(await fees.listAllDues()));

  for (const paid of await fees.listPayments(billId)) await fees.deletePayment(paid.id);
  bill = await fees.getFee(billId);
  check("reversing everything leaves an ordinary unpaid bill", bill.status === "unpaid" && bill.balance === 5000 && !bill.promisedDate);

  await fees.recordPayment(billId, 1000, "cash", today, "", "", day(4));
  await fees.recordPayment(billId, 500, "cash", today, "", "");
  let [first, second] = await fees.listPayments(billId);
  await fees.deletePayment(second.id);
  check("reversing one of two part payments keeps the promise", (await fees.getFee(billId)).promisedDate === day(4));
  await fees.deletePayment(first.id);
  bill = await fees.getFee(billId);
  check("reversing the only part payment drops its promise", !bill.promisedDate && bill.chaseDate === "2026-03-15" && bill.status === "unpaid");

  await inmates.createInmate(inmate("Stay guest", null, { admissionType: "stay", stayDays: 5 }));
  const gen = await fees.generateInvoices("2026-04");
  check("monthly bills raised for active monthly inmates only", gen.created === 2, JSON.stringify(gen));
  const again = await fees.generateInvoices("2026-04");
  check("raising again creates nothing", again.created === 0 && again.skipped === 2, JSON.stringify(again));
  const april = (await fees.listFees("all", "2026-04")).find((f) => f.studentId === b);
  check("monthly bill priced from the inmate and due on their join day", april.total === 6000 && april.dueDate === "2026-04-15");

  check("moving a bill onto an occupied month is refused", await rejects(fees.updateFee(april.id, { ...april, period: "2026-03" }), fees.DuplicateInvoiceError));
  await fees.updateFee(april.id, { ...april, period: "2027-01" });
  check("moving a bill across years moves its document", views.billById(april.id).docId === `${b}_2027` && store.docs.has(`fees/${b}_2027`));
  const due = await fees.listDueForReminder("2026-12-31");
  check("reminder list is ordered by due date", due.length >= 1 && due.every((f, i) => i === 0 || due[i - 1].dueDate <= f.dueDate));
  const totals = await fees.feeTotals();
  check("fee totals add up", Math.abs(totals.billed - (totals.collected + totals.outstanding)) < 0.01);

  // Cascades
  const c = await complaints.createComplaint({ branchId: "", roomId: r1, studentId: b, title: "Fan", description: "", category: "electrical", status: "open", photoFile: null, raisedOn: "" });
  await rooms.deleteRoom(r1);
  check("deleting a room detaches its inmates", (await inmates.getInmate(b)).roomId === null);
  check("deleting a room keeps its complaints", (await complaints.getComplaint(c)).roomId === null);
  await inmates.deleteInmate(b);
  check("deleting an inmate removes their bills", ![...store.docs.keys()].some((k) => k.startsWith(`fees/${b}_`)));
  check("complaints outlive the inmate", (await complaints.getComplaint(c)).studentId === null);

  // Messaging in chunks
  const recipients = Array.from({ length: 250 }, (_, i) => ({ studentId: null, name: `P${i}`, phone: "1", body: "x".repeat(400) }));
  const batch = await messaging.queueBatch("announcement", recipients);
  check("large batches are split into chunk documents", store.query("messages", []).length === 3);
  const entries = await messaging.listBatchEntries(batch);
  await messaging.markMessage(entries[0].id, "sent");
  const summary = (await messaging.listBatches()).find((s) => s.batchId === batch);
  check("batch summary counts sent and pending", summary.total === 250 && summary.sent === 1 && summary.pending === 249);
  await messaging.deleteBatch(batch);
  check("deleting a batch removes its documents", store.query("messages", []).length === 0);

  check("changes are recorded in the activity feed", cloud.recentActivity().some((e) => e.action === "payment"));
}

async function automaticBilling() {
  console.log("Automatic monthly billing");
  const { app } = await fresh();
  const { inmates, fees, views, rooms, format } = app;
  const now = fees.currentPeriod();
  const today = format.toIsoDate();
  const billsOf = (id) => views.billsForStudent(id).filter((b) => b.period === now);

  const r = await rooms.createRoom(room("7", 4, 4500));
  const monthly = await inmates.createInmate(inmate("Monthly", r, { joinedOn: today, monthlyRent: 5200 }));
  check("a new monthly inmate is billed for this month on admission", billsOf(monthly).length === 1 && billsOf(monthly)[0].total === 5200);
  check("the bill falls due on their join day", billsOf(monthly)[0].dueDate === fees.dueDateFor(now, fees.anchorDayFor(today)));

  const roomPriced = await inmates.createInmate(inmate("Room priced", r, { joinedOn: today, monthlyRent: 0 }));
  check("with no personal rent, the room's rent is used", billsOf(roomPriced)[0].total === 4500);

  const guest = await inmates.createInmate(inmate("Guest", null, { admissionType: "stay", stayDays: 4, joinedOn: today }));
  check("a fixed-days guest gets no monthly bill", billsOf(guest).length === 0);

  const future = await inmates.createInmate(inmate("Joining next year", null, { joinedOn: `${Number(now.slice(0, 4)) + 1}-01-10` }));
  check("someone joining in a later month is not billed yet", billsOf(future).length === 0);

  check("the automatic run finds nothing left to do", (await fees.raiseDueBills()) === 0);

  await fees.deleteFee(billsOf(monthly)[0].id);
  check("the automatic run raises a missing bill", (await fees.raiseDueBills()) === 1 && billsOf(monthly).length === 1);
  check("running it again raises nothing", (await fees.raiseDueBills()) === 0);

  await inmates.markLeft(roomPriced);
  await fees.deleteFee(billsOf(roomPriced)[0].id);
  check("an inmate who has left is not billed", (await fees.raiseDueBills()) === 0);
  await inmates.reinstate(roomPriced);
  check("reinstating an inmate bills them for this month", billsOf(roomPriced).length === 1);

  // Admitted before a rent was agreed: a ₹0 bill, which reads as paid.
  const noRent = await inmates.createInmate(inmate("No rent yet", null, { joinedOn: `${now}-01`, monthlyRent: 0 }));
  check("admitted with no rent and no room: a ₹0 bill", billsOf(noRent)[0]?.total === 0);
  await fees.changeRent(noRent, { rent: 6000, from: "this", billingDay: null });
  let bill = await fees.getFee(billsOf(noRent)[0].id);
  check("changing rent from this month re-prices this month's bill", bill.total === 6000 && bill.rent === 6000);
  check("so the new rent shows as due", bill.status === "unpaid" && bill.balance === 6000);
  check("and the inmate's rent is saved", views.inmateById(noRent).monthlyRent === 6000);
  check("keeping the due day leaves the joining day", bill.dueDate === `${now}-01`);

  await fees.recordPayment(bill.id, 4000, "cash", today, "", "");
  check("cutting the rent below what is already paid is refused", await rejects(fees.changeRent(noRent, { rent: 3000, from: "this", billingDay: null }), fees.OverpaymentError));
  check("and nothing was changed", views.inmateById(noRent).monthlyRent === 6000);

  await fees.changeRent(noRent, { rent: 7000, from: "next", billingDay: 20 });
  bill = await fees.getFee(bill.id);
  check("from next month: this month's bill keeps its amount", bill.total === 6000);
  check("an unpaid bill moves to the new due day", bill.dueDate === fees.dueDateFor(now, 20));
  check("the new billing day is remembered for later bills", fees.billingDayOf(views.inmateById(noRent)) === 20);
}

async function backups() {
  console.log("Backups");
  const { store, app } = await fresh();
  const r = await app.rooms.createRoom(room("1", 3));
  const id = await app.inmates.createInmate(inmate("Ünïcode name", r, { notes: "line one\nline two" }));
  const bill = await app.fees.createFee({ studentId: id, period: "2026-05", rent: 4000, electricity: 0, water: 0, other: 0, discount: 0, dueDate: "", note: "" });
  await app.fees.recordPayment(bill, 1000, "upi", "2026-05-02", "R1", "");

  const file = new app.fs.File("file:///cache/test.hostelbak");
  const result = await app.backup.writeBackup(file, "secret passphrase");
  const text = await file.text();
  check("backup is encrypted", result.encrypted && !text.includes("Ünïcode") && !text.includes("9876500000"));

  // A brand-new hostel restoring it.
  const target = new SharedStore();
  const other = await device(target);
  await other.branches.seedBranches();
  const copy = new other.fs.File("file:///cache/in.hostelbak");
  copy.write(new Uint8Array(Buffer.from(text)));
  check("wrong passphrase refused", await rejects(other.backup.restoreBackup(copy.uri, "nope"), other.backup.BackupError));
  check("nothing changed after a refused restore", target.query("inmates", []).length === 0);

  const lines = text.split("\n");
  const tampered = new other.fs.File("file:///cache/bad.hostelbak");
  lines[1] = lines[1].slice(0, -4) + (lines[1].endsWith("AAAA") ? "BBBB" : "AAAA");
  tampered.write(new Uint8Array(Buffer.from(lines.join("\n"))));
  check("tampered file refused", await rejects(other.backup.restoreBackup(tampered.uri, "secret passphrase"), other.backup.BackupError));

  const restored = await other.backup.restoreBackup(copy.uri, "secret passphrase");
  await settle();
  const copyInmate = await other.inmates.getInmate(id);
  check("records restored exactly", copyInmate && copyInmate.fullName === "Ünïcode name" && copyInmate.notes === "line one\nline two");
  other.branches.setActiveBranchId(T);
  const restoredBill = await other.fees.getFee(bill);
  check("bills and payments restored", restoredBill && restoredBill.amountPaid === 1000 && restoredBill.status === "partial");
  check("restore counts inserted rows", restored.inserted.students === 1 && restored.inserted.payments === 1);

  const again = await other.backup.restoreBackup(copy.uri, "secret passphrase");
  check("re-importing adds nothing", again.rowsRestored === 0 && target.query("inmates", []).length === 1);
}

async function twoDevices() {
  console.log("Two devices on one store");
  const store = new SharedStore();
  const a = await device(store, OWNER);
  await a.branches.seedBranches();
  a.branches.setActiveBranchId(T);
  const b = await device(store, WARDEN);
  b.branches.setActiveBranchId(T);

  let heard = 0;
  b.cloud.subscribeStore(() => (heard += 1));
  const live = await a.inmates.createInmate(inmate("Live one", null));
  await settle(60);
  check("a change on one device reaches the other live", heard > 0 && (await b.inmates.getInmate(live)) !== null);

  const bed = await a.rooms.createRoom(room("9", 1));
  await settle(60);
  const race = await Promise.allSettled([
    a.inmates.createInmate(inmate("From A", bed)),
    b.inmates.createInmate(inmate("From B", bed)),
  ]);
  check("two devices racing for the last bed: exactly one gets it", race.filter((r) => r.status === "fulfilled").length === 1,
    race.map((r) => r.status).join(","));

  const pair = await Promise.all([a.inmates.createInmate(inmate("N1", null)), b.inmates.createInmate(inmate("N2", null))]);
  await settle(60);
  const numbers = pair.map((id) => store.docs.get(`inmates/${id}`).admissionNo);
  check("simultaneous admissions get different numbers", numbers[0] !== numbers[1], numbers.join(","));

  const billId = await a.fees.createFee({ studentId: live, period: "2026-06", rent: 5000, electricity: 0, water: 0, other: 0, discount: 0, dueDate: "", note: "" });
  await settle(60);
  const pay = await Promise.allSettled([
    a.fees.recordPayment(billId, 3000, "cash", "2026-06-01", "", ""),
    b.fees.recordPayment(billId, 3000, "cash", "2026-06-01", "", ""),
  ]);
  await settle(60);
  const paid = (await a.fees.getFee(billId)).amountPaid;
  check("two collectors cannot take more than is owed", pay.filter((r) => r.status === "fulfilled").length === 1 && paid === 3000, `paid ${paid}`);

  const gen = await Promise.all([a.fees.generateInvoices("2026-07"), b.fees.generateInvoices("2026-07")]);
  await settle(60);
  const july = a.views.allBills().filter((x) => x.period === "2026-07");
  const perInmate = new Set(july.map((x) => x.studentId));
  check("raising bills from two devices at once never duplicates", july.length === perInmate.size, `${july.length} bills, ${gen.map((g) => g.created)}`);

  const viewer = await device(store, VIEWER);
  viewer.branches.setActiveBranchId(T);
  let message = "";
  try {
    await viewer.inmates.createInmate(inmate("Nope", null, { admissionNo: "99" }));
  } catch (error) {
    message = error.message;
  }
  check("a view-only person is told they cannot change records", /view the hostel records but not change them/.test(message), message);
}

(async () => {
  const started = Date.now();
  for (const suite of [pureLogic, singleDevice, automaticBilling, backups, twoDevices]) {
    try {
      await suite();
    } catch (error) {
      fail += 1;
      console.log(`  FAIL ${suite.name} crashed -> ${error && error.stack ? error.stack : error}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  process.exit(fail ? 1 : 0);
})();
