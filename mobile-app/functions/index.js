const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");

initializeApp();
const db = getFirestore();

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Expo accepts up to 100 messages per request.
async function sendExpoPushMessages(messages) {
  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  await Promise.all(
    chunks.map((chunk) =>
      fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      })
    )
  );
}

// Broadcast every new notice to all students with a registered push token.
exports.onNoticeCreated = onDocumentCreated("notices/{noticeId}", async (event) => {
  const notice = event.data.data();

  const studentsSnap = await db.collection("users").where("role", "==", "student").get();
  const tokens = studentsSnap.docs.map((d) => d.data().pushToken).filter(Boolean);
  if (tokens.length === 0) return;

  await sendExpoPushMessages(
    tokens.map((token) => ({
      to: token,
      title: "New Notice",
      body: notice.message?.slice(0, 120) ?? "A new notice has been posted.",
      data: { type: "notice" },
    }))
  );
});

// Notify the student when their grievance is marked resolved.
exports.onGrievanceUpdated = onDocumentUpdated("grievances/{grievanceId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || after.status !== "resolved") return;

  const userSnap = await db.collection("users").doc(after.studentId).get();
  const token = userSnap.data()?.pushToken;
  if (!token) return;

  await sendExpoPushMessages([
    {
      to: token,
      title: "Grievance Resolved",
      body: "Your grievance has been marked as resolved by the Rector.",
      data: { type: "grievance" },
    },
  ]);
});

// Notify the student when their hostel application is approved or rejected.
exports.onApplicationUpdated = onDocumentUpdated("applications/{applicationId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || after.status === "pending") return;

  const userSnap = await db.collection("users").doc(after.studentId).get();
  const token = userSnap.data()?.pushToken;
  if (!token) return;

  await sendExpoPushMessages([
    {
      to: token,
      title: "Hostel Application Update",
      body: `Your hostel application has been ${after.status}.`,
      data: { type: "application", status: after.status },
    },
  ]);
});
