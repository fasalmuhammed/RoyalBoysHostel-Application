import { addDoc, collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

import { db } from "@/firebase/config";
import { Payment } from "@/types";

const paymentsRef = collection(db, "payments");

export const HOSTEL_UPI_ID = "1234567890@ybl";

export function submitPayment(studentId: string, studentName: string, transactionId: string) {
  return addDoc(paymentsRef, {
    studentId,
    studentName,
    transactionId,
    status: "pending",
    createdAt: Date.now(),
  });
}

export function subscribeStudentPayments(studentId: string, callback: (items: Payment[]) => void) {
  const q = query(paymentsRef, where("studentId", "==", studentId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment)));
  });
}
