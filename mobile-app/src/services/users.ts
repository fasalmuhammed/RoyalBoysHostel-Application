import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";

import { db } from "@/firebase/config";
import { UserProfile } from "@/types";

const usersRef = collection(db, "users");

export function subscribeUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    callback(snap.exists() ? (snap.data() as UserProfile) : null);
  });
}

export function subscribeStudents(callback: (students: UserProfile[]) => void) {
  const q = query(usersRef, where("role", "==", "student"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data() as UserProfile));
  });
}

export function subscribePendingRectors(callback: (rectors: UserProfile[]) => void) {
  const q = query(usersRef, where("role", "==", "rector"), where("status", "==", "pending"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data() as UserProfile));
  });
}

export function approveRector(uid: string) {
  return updateDoc(doc(db, "users", uid), { status: "approved" });
}

export function markStudentLeft(uid: string) {
  return updateDoc(doc(db, "users", uid), { hostelStatus: "left" });
}

export function reinstateStudent(uid: string) {
  return updateDoc(doc(db, "users", uid), { hostelStatus: "active" });
}
