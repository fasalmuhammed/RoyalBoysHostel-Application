import { addDoc, arrayRemove, arrayUnion, collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";

import { db } from "@/firebase/config";
import { Room } from "@/types";

const roomsRef = collection(db, "rooms");

export function addRoom(block: string, roomNumber: string, capacity: number) {
  return addDoc(roomsRef, { block, roomNumber, capacity, occupantIds: [] });
}

export function subscribeRooms(callback: (rooms: Room[]) => void) {
  const q = query(roomsRef, orderBy("block", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Room)));
  });
}

export function assignStudentToRoom(roomId: string, studentId: string) {
  return updateDoc(doc(db, "rooms", roomId), { occupantIds: arrayUnion(studentId) });
}

export function removeStudentFromRoom(roomId: string, studentId: string) {
  return updateDoc(doc(db, "rooms", roomId), { occupantIds: arrayRemove(studentId) });
}
