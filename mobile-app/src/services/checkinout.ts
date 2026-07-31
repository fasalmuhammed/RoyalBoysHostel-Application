import { addDoc, collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

import { db } from "@/firebase/config";
import { CheckLog, CheckType } from "@/types";

const logsRef = collection(db, "checklogs");

export function logCheck(
  studentId: string,
  studentName: string,
  type: CheckType,
  date: string,
  time: string,
  wardenId: string
) {
  return addDoc(logsRef, { studentId, studentName, type, date, time, wardenId, createdAt: Date.now() });
}

export function subscribeStudentLogs(studentId: string, callback: (logs: CheckLog[]) => void) {
  const q = query(logsRef, where("studentId", "==", studentId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CheckLog)));
  });
}
