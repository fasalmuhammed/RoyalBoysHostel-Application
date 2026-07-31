import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Same Firebase project as the mobile app — this is client (public) config, safe to embed.
const firebaseConfig = {
  apiKey: "AIzaSyCUHV5Q9vQmcw1njdkVfZ5us9pMCO_l5qU",
  authDomain: "hostel-administration-1432a.firebaseapp.com",
  projectId: "hostel-administration-1432a",
  storageBucket: "hostel-administration-1432a.firebasestorage.app",
  messagingSenderId: "1062495306395",
  appId: "1:1062495306395:web:501f7f237d006a5b7bfc3e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const applicationsRef = collection(db, "applications");

const form = document.getElementById("application-form");
const errorEl = document.getElementById("error");
const submitButton = document.getElementById("submit-button");
const successEl = document.getElementById("success");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const data = new FormData(form);
  const firstName = data.get("firstName").trim();
  const lastName = data.get("lastName").trim();
  const fatherName = data.get("fatherName").trim();
  const email = data.get("email").trim().toLowerCase();
  const address = data.get("address").trim();
  const idProof = data.get("idProof").trim();
  const income = Number(data.get("income"));

  if (!firstName || !lastName || !fatherName || !address || !idProof) {
    showError("Please fill in all fields.");
    return;
  }
  if (!emailPattern.test(email)) {
    showError("Please enter a valid email address.");
    return;
  }
  if (!Number.isFinite(income) || income < 0) {
    showError("Please enter a valid family income.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting…";

  try {
    await addDoc(applicationsRef, {
      studentId: null,
      studentName: `${firstName} ${lastName}`.trim(),
      applicantEmail: email,
      firstName,
      lastName,
      fatherName,
      address,
      idProof,
      income,
      status: "pending",
      createdAt: Date.now(),
    });

    form.hidden = true;
    successEl.hidden = false;
  } catch (err) {
    console.error(err);
    showError("Something went wrong submitting your application. Please try again.");
    submitButton.disabled = false;
    submitButton.textContent = "Submit Application";
  }
});
