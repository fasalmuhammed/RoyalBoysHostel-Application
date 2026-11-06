/**
 * Checks the server's monthly billing against the local Firestore emulator.
 * Run with: npm run test:billing
 */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "demo-hostel" });
const db = getFirestore();
const { raiseMonthlyBills, dueDateFor, indiaDate } = require("./billing");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
}

const inmate = (id, extra) =>
  db.collection("inmates").doc(id).set({
    id, fullName: id, status: "active", admissionType: "monthly", branchId: "branch-thammanam",
    roomId: null, monthlyRent: 6000, joinedOn: "2026-01-14", ...extra,
  });
const billsOf = async (id, year = "2026") => (await db.collection("fees").doc(`${id}_${year}`).get()).data()?.bills ?? {};

(async () => {
  console.log("Server monthly billing");

  check("due on the day of the month they joined", dueDateFor("2026-02", "2026-01-14") === "2026-02-14");
  check("a short month uses its last day", dueDateFor("2026-02", "2026-01-31") === "2026-02-28");
  check("a leap February has 29 days", dueDateFor("2028-02", "2026-01-31") === "2028-02-29");
  check("a 30-day month uses the 30th", dueDateFor("2026-04", "2026-01-31") === "2026-04-30");
  check("no join date falls back to the 1st", dueDateFor("2026-02", "") === "2026-02-01");
  check("a join date saved without leading zeros is read right", dueDateFor("2026-02", "2026-6-28") === "2026-02-28" && dueDateFor("2026-02", "2026-7-7") === "2026-02-07");
  check("a moved billing day is used as given", dueDateFor("2026-02", 17) === "2026-02-17");
  check("a moved billing day still fits a short month", dueDateFor("2026-02", 30) === "2026-02-28");
  check("the day rolls over at midnight in India, not in London", indiaDate(new Date("2026-01-31T18:45:00Z")) === "2026-02-01");
  check("and has not rolled over just before", indiaDate(new Date("2026-01-31T18:15:00Z")) === "2026-01-31");

  await db.collection("rooms").doc("room-a").set({ id: "room-a", branchId: "branch-thammanam", rent: 4500, capacity: 4 });
  await inmate("arun", {});
  await inmate("room-priced", { monthlyRent: 0, roomId: "room-a" });
  await inmate("short-stay", { admissionType: "stay", stayDays: 5 });
  await inmate("has-left", { status: "left" });
  await inmate("joins-march", { joinedOn: "2026-03-05" });
  await inmate("moved-day", { joinedOn: "2026-01-14", billingDay: 20 });
  await inmate("kala", { branchId: "branch-Kalamassery", joinedOn: "2025-12-31" });

  check("first run bills the four who are due", (await raiseMonthlyBills(db, "2026-02")) === 4);
  check("a moved billing day sets the due date", (await billsOf("moved-day"))["2026-02"]?.dueDate === "2026-02-20");
  const arun = (await billsOf("arun"))["2026-02"];
  check("billed the inmate's own rent", arun && arun.total === 6000 && arun.rent === 6000);
  check("due on the 14th", arun && arun.dueDate === "2026-02-14");
  check("starts unpaid, with no promise", arun && Object.keys(arun.payments).length === 0 && !arun.promisedDate);
  const year = (await db.collection("fees").doc("arun_2026").get()).data();
  check("the bill carries the inmate's hostel, so the right manager sees it", year.branchId === "branch-thammanam" && year.studentId === "arun");
  check("no rent of their own: billed the room's", (await billsOf("room-priced"))["2026-02"]?.total === 4500);
  check("joined on the 31st: due on 28 February", (await billsOf("kala"))["2026-02"]?.dueDate === "2026-02-28");
  check("a short stay is not billed monthly", Object.keys(await billsOf("short-stay")).length === 0);
  check("someone who has left is not billed", Object.keys(await billsOf("has-left")).length === 0);
  check("someone joining next month is not billed yet", Object.keys(await billsOf("joins-march")).length === 0);

  check("running it again raises nothing", (await raiseMonthlyBills(db, "2026-02")) === 0);
  check("and leaves the first bill exactly as it was", (await billsOf("arun"))["2026-02"].id === arun.id);

  // A payment already taken must survive later runs.
  await db.collection("fees").doc("arun_2026").set(
    { bills: { "2026-02": { payments: { p1: { id: "p1", amount: 2000, method: "cash", paidOn: "2026-02-10", reference: "", note: "", createdAt: 1 } } } } },
    { merge: true }
  );
  check("next month bills the newcomer too", (await raiseMonthlyBills(db, "2026-03")) === 5);
  const after = await billsOf("arun");
  check("earlier months and their payments are untouched", after["2026-02"].payments.p1.amount === 2000 && Boolean(after["2026-03"]));
  check("the newcomer is due on the day they joined", (await billsOf("joins-march"))["2026-03"]?.dueDate === "2026-03-05");

  check("two runs at the same moment do not bill twice", (await Promise.all([raiseMonthlyBills(db, "2026-04"), raiseMonthlyBills(db, "2026-04")])).reduce((a, b) => a + b, 0) === 5);
  check("a new year starts a new record", (await raiseMonthlyBills(db, "2027-01")) === 5 && Boolean((await billsOf("arun", "2027"))["2027-01"]));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
