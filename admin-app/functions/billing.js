/**
 * Monthly bills, raised by the server.
 *
 * The app also raises a missing bill when someone opens it, but that depends
 * on someone opening it. This runs by itself early every morning (India
 * time), so the month's bills exist from the 1st whether or not anyone
 * looked, and a month can never be skipped.
 *
 * The rules are the app's own (src/services/fees.ts) and must stay in step
 * with it:
 *  - only active inmates on a monthly admission are billed (a fixed "stay"
 *    is billed once, when it is booked);
 *  - nobody is billed for a month before the one they joined in;
 *  - the amount is the inmate's own rent, or their room's when none is set;
 *  - the bill is due on the day of the month they joined (the last day, in a
 *    month too short to have that day);
 *  - a month that already has a bill is left alone.
 */
const crypto = require("node:crypto");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");

const two = (n) => String(n).padStart(2, "0");

/** Today's date in India, as yyyy-mm-dd, whatever clock the server keeps. */
function indiaDate(now = new Date()) {
  const india = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return `${india.getUTCFullYear()}-${two(india.getUTCMonth() + 1)}-${two(india.getUTCDate())}`;
}

/**
 * The due date in a month for someone billed on a given day of the month:
 * the day they joined (a yyyy-mm-dd date), or a day number when the admin
 * moved their billing day (an inmate's `billingDay`).
 */
function dueDateFor(period, joinedOn) {
  const [year, month] = period.split("-").map(Number);
  const joinedDay = typeof joinedOn === "number" ? joinedOn : Number(String(joinedOn ?? "").slice(8, 10));
  const anchor = Number.isFinite(joinedDay) && joinedDay > 0 ? joinedDay : 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${two(Math.min(anchor, daysInMonth))}`;
}

function isBillable(inmate, period) {
  if (inmate.status !== "active" || inmate.admissionType === "stay") return false;
  return !inmate.joinedOn || String(inmate.joinedOn).slice(0, 7) <= period;
}

/**
 * Raises every missing bill for one month. Safe to run any number of times:
 * each inmate's bill is written inside a transaction that first checks the
 * month is still unbilled, so a run that overlaps the app, or itself, adds
 * nothing twice.
 */
async function raiseMonthlyBills(db, period) {
  const [inmates, rooms] = await Promise.all([
    db.collection("inmates").where("status", "==", "active").get(),
    db.collection("rooms").get(),
  ]);
  const roomRent = new Map(rooms.docs.map((doc) => [doc.id, Number(doc.data().rent) || 0]));

  let created = 0;
  for (const doc of inmates.docs) {
    const inmate = doc.data();
    if (!isBillable(inmate, period)) continue;

    const ref = db.collection("fees").doc(`${doc.id}_${period.slice(0, 4)}`);
    const raised = await db.runTransaction(async (tx) => {
      const year = (await tx.get(ref)).data();
      if (year?.bills?.[period]) return false;

      const rent = Number(inmate.monthlyRent) > 0 ? Number(inmate.monthlyRent) : (roomRent.get(inmate.roomId) ?? 0);
      const now = Date.now();
      const bill = {
        id: crypto.randomUUID(),
        period,
        rent,
        electricity: 0,
        water: 0,
        other: 0,
        discount: 0,
        total: rent,
        dueDate: dueDateFor(period, Number(inmate.billingDay) > 0 ? Number(inmate.billingDay) : inmate.joinedOn),
        note: "",
        createdAt: now,
        updatedAt: now,
        payments: {},
      };
      tx.set(
        ref,
        { studentId: doc.id, year: period.slice(0, 4), branchId: inmate.branchId ?? null, bills: { [period]: bill } },
        { merge: true }
      );
      return true;
    });
    if (raised) created += 1;
  }
  return created;
}

exports.indiaDate = indiaDate;
exports.dueDateFor = dueDateFor;
exports.raiseMonthlyBills = raiseMonthlyBills;

// Every day rather than only on the 1st: a run that fails is made up the next
// morning, and someone admitted outside the app is picked up within a day.
exports.monthlyBills = onSchedule(
  { schedule: "15 0 * * *", timeZone: "Asia/Kolkata", retryCount: 3, timeoutSeconds: 300, memory: "256MiB" },
  async () => {
    const period = indiaDate().slice(0, 7);
    const created = await raiseMonthlyBills(getFirestore(), period);
    console.log(`Monthly bills for ${period}: ${created} raised.`);
  }
);
