import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";

import { db } from "@/firebase/config";
import { Grievance, GrievanceStatus } from "@/types";

const grievancesRef = collection(db, "grievances");

export interface NewGrievanceInput {
  studentId: string;
  username: string;
  hostelBlock: string;
  roomNo: string;
  message: string;
}

export function submitGrievance(input: NewGrievanceInput) {
  return addDoc(grievancesRef, { ...input, status: "open" as GrievanceStatus, createdAt: Date.now() });
}

export function subscribeGrievances(callback: (items: Grievance[]) => void) {
  const q = query(grievancesRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Grievance)));
  });
}

export function setGrievanceStatus(id: string, status: GrievanceStatus) {
  return updateDoc(doc(db, "grievances", id), { status });
}

export function subscribeStudentGrievances(studentId: string, callback: (items: Grievance[]) => void) {
  const q = query(grievancesRef, where("studentId", "==", studentId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Grievance)));
  });
}
