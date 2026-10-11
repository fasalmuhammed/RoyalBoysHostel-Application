/**
 * Browser stand-in for `expo-secure-store`.
 *
 * The app lock is a per-device guard, as it was on the phone: the PIN hash
 * and lock state are kept in this browser's storage for the artifact, never
 * in the shared records. Each device (and each person on it) sets its own
 * PIN, and a forgotten one is cleared by clearing this browser's data for
 * the app -- the hostel records stay untouched in Claude storage.
 *
 * Storage the browser blocks leaves the values in memory for this visit.
 */

const PREFIX = "hostel.secure.";
const memory = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  try {
    const value = localStorage.getItem(PREFIX + key);
    if (value !== null) return value;
  } catch {
    // Fall through to this visit's copy.
  }
  return memory.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  memory.set(key, String(value));
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // Blocked storage: the value holds for this visit only.
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  memory.delete(key);
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing stored to remove.
  }
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}
