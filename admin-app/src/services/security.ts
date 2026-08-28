import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { hashPin, newSaltBase64 } from "./crypto";

/**
 * App lock.
 *
 * The PIN is never stored -- only a salted PBKDF2 hash, kept in the platform
 * keystore (Android Keystore / iOS Keychain) rather than in the database, so
 * copying the database file off the device does not reveal it.
 *
 * Note what this does and does not protect. The lock keeps a person holding
 * the unlocked phone out of the student records. It is not disk encryption: on
 * a rooted device the SQLite file is still readable. That is the reason
 * exported backups carry their own passphrase encryption.
 */

const KEY_HASH = "lock.pinHash";
const KEY_SALT = "lock.pinSalt";
const KEY_BIOMETRIC = "lock.biometric";
const KEY_FAILURES = "lock.failures";
const KEY_LOCKED_UNTIL = "lock.lockedUntil";

/** Failed attempts allowed before the cool-down starts. */
const FREE_ATTEMPTS = 5;

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_HASH)) !== null;
}

export async function setPin(pin: string): Promise<void> {
  const salt = newSaltBase64();
  await SecureStore.setItemAsync(KEY_SALT, salt);
  await SecureStore.setItemAsync(KEY_HASH, hashPin(pin, salt));
  await resetFailures();
}

export interface VerifyResult {
  ok: boolean;
  /** Remaining attempts before a cool-down, once past the free allowance. */
  attemptsLeft: number | null;
  /** Epoch millis until which entry is blocked, when locked out. */
  lockedUntil: number | null;
}

/**
 * Checks a PIN and applies an escalating cool-down.
 *
 * Delay is capped at five minutes: long enough to make guessing a 4-digit PIN
 * impractical, short enough that a tired warden is not locked out of their own
 * hostel records for the evening.
 */
export async function verifyPin(pin: string): Promise<VerifyResult> {
  const lockedUntil = await getLockedUntil();
  if (lockedUntil && Date.now() < lockedUntil) {
    return { ok: false, attemptsLeft: 0, lockedUntil };
  }

  const salt = await SecureStore.getItemAsync(KEY_SALT);
  const stored = await SecureStore.getItemAsync(KEY_HASH);
  if (!salt || !stored) return { ok: false, attemptsLeft: null, lockedUntil: null };

  if (hashPin(pin, salt) === stored) {
    await resetFailures();
    return { ok: true, attemptsLeft: null, lockedUntil: null };
  }

  const failures = (await getFailures()) + 1;
  await SecureStore.setItemAsync(KEY_FAILURES, String(failures));

  if (failures >= FREE_ATTEMPTS) {
    const over = failures - FREE_ATTEMPTS;
    const delayMs = Math.min(30_000 * 2 ** over, 5 * 60_000);
    const until = Date.now() + delayMs;
    await SecureStore.setItemAsync(KEY_LOCKED_UNTIL, String(until));
    return { ok: false, attemptsLeft: 0, lockedUntil: until };
  }

  return { ok: false, attemptsLeft: FREE_ATTEMPTS - failures, lockedUntil: null };
}

export async function changePin(currentPin: string, nextPin: string): Promise<boolean> {
  const result = await verifyPin(currentPin);
  if (!result.ok) return false;
  await setPin(nextPin);
  return true;
}

async function getFailures(): Promise<number> {
  const raw = await SecureStore.getItemAsync(KEY_FAILURES);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function getLockedUntil(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(KEY_LOCKED_UNTIL);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (Date.now() >= n) {
    await SecureStore.deleteItemAsync(KEY_LOCKED_UNTIL);
    return null;
  }
  return n;
}

async function resetFailures(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_FAILURES);
  await SecureStore.deleteItemAsync(KEY_LOCKED_UNTIL);
}

// --- biometrics -------------------------------------------------------------

export interface BiometricSupport {
  available: boolean;
  enrolled: boolean;
  label: string;
}

export async function biometricSupport(): Promise<BiometricSupport> {
  try {
    const available = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let label = "Biometric unlock";
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = "Face unlock";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = "Fingerprint unlock";
    }
    return { available, enrolled, label };
  } catch {
    return { available: false, enrolled: false, label: "Biometric unlock" };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_BIOMETRIC)) === "1";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(KEY_BIOMETRIC, "1");
  else await SecureStore.deleteItemAsync(KEY_BIOMETRIC);
}

/** Prompts for fingerprint/face. The PIN always remains available as a fallback. */
export async function authenticateBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock hostel records",
      fallbackLabel: "Use PIN",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

/** Wipes lock credentials. Used when the admin resets the app to factory state. */
export async function clearSecurity(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_HASH);
  await SecureStore.deleteItemAsync(KEY_SALT);
  await SecureStore.deleteItemAsync(KEY_BIOMETRIC);
  await resetFailures();
}
