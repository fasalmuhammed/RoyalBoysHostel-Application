import { addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";

import { db } from "@/firebase/config";
import { ApplicationStatus, HostelApplication } from "@/types";

const applicationsRef = collection(db, "applications");

export interface NewApplicationInput {
  studentId: string | null;
  studentName: string;
  applicantEmail?: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  address: string;
  idProof: string;
  income: number;
}

export function submitApplication(input: NewApplicationInput) {
  return addDoc(applicationsRef, {
    ...input,
    status: "pending" as ApplicationStatus,
    createdAt: Date.now(),
  });
}

export function subscribeAllApplications(callback: (apps: HostelApplication[]) => void) {
  const q = query(applicationsRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HostelApplication)));
  });
}

export function subscribeStudentApplications(studentId: string, callback: (apps: HostelApplication[]) => void) {
  const q = query(applicationsRef, where("studentId", "==", studentId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HostelApplication)));
  });
}

export function setApplicationStatus(id: string, status: ApplicationStatus, roomId?: string) {
  return updateDoc(doc(db, "applications", id), {
    status,
    ...(roomId ? { roomId } : {}),
  });
}

// Claims any unclaimed (studentId === null) web-form applications submitted with
// this email, linking them to the newly-registered mobile account. Best-effort —
// callers should swallow errors, since the common case is no matching application.
export function claimPendingApplications(email: string, studentId: string, studentName: string) {
  const normalized = email.trim().toLowerCase();
  const q = query(applicationsRef, where("applicantEmail", "==", normalized), where("studentId", "==", null));
  return getDocs(q).then((snap) => Promise.all(snap.docs.map((d) => updateDoc(d.ref, { studentId, studentName }))));
}
