import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { db } from "@/firebase/config";
import { Notice } from "@/types";

const noticesRef = collection(db, "notices");

export function postNotice(date: string, message: string, createdBy: string) {
  return addDoc(noticesRef, { date, message, createdBy, createdAt: Date.now() });
}

export function subscribeNotices(callback: (notices: Notice[]) => void) {
  const q = query(noticesRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice)));
  });
}
