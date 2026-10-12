/**
 * Logins: the admin's own, and one or more managers per hostel.
 *
 * The list is read straight from the server (only the admin may); every
 * change goes through the server's `staff` function, which checks that the
 * admin is the one asking. The app cannot write a login record itself.
 */
import { collection, onSnapshot } from "firebase/firestore";

import { startBackend } from "@/backend";
import type { StaffRecord } from "@/backend/firebase";

export type { StaffRecord };

/** Same rule the server applies, so a mistake is caught before the request. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD = 8;

/** Live list of every login, admin first, then managers by name. */
export function watchStaff(
  onChange: (staff: StaffRecord[]) => void,
  onError: (message: string) => void
): () => void {
  const { firestore } = startBackend();
  return onSnapshot(
    collection(firestore, "staff"),
    (snap) => {
      const staff = snap.docs.map((d) => ({ ...(d.data() as StaffRecord), uid: d.id }));
      staff.sort((a, b) =>
        a.role !== b.role ? (a.role === "admin" ? -1 : 1) : (a.name || a.username).localeCompare(b.name || b.username)
      );
      onChange(staff);
    },
    () => onError("Could not load the logins. Check the internet connection.")
  );
}

function call(action: string, data: Record<string, unknown>): Promise<{ uid: string }> {
  return startBackend().call<{ uid: string }>("staff", { action, ...data });
}

export function createManager(input: {
  username: string;
  name: string;
  password: string;
  branchId: string;
}): Promise<{ uid: string }> {
  return call("create", { ...input, username: input.username.trim().toLowerCase(), name: input.name.trim() });
}

export function updateManager(uid: string, patch: { name?: string; branchId?: string }): Promise<{ uid: string }> {
  return call("update", { uid, ...patch });
}

export function resetManagerPassword(uid: string, password: string): Promise<{ uid: string }> {
  return call("resetPassword", { uid, password });
}

export function setManagerDisabled(uid: string, disabled: boolean): Promise<{ uid: string }> {
  return call("setDisabled", { uid, disabled });
}

export function removeManager(uid: string): Promise<{ uid: string }> {
  return call("remove", { uid });
}

/** Changes the password of whoever is signed in (used for the admin login). */
export function changeOwnPassword(current: string, next: string): Promise<void> {
  return startBackend().changePassword(current, next);
}
