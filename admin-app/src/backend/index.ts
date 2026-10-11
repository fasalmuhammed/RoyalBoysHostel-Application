/**
 * Which Firebase project this build talks to.
 *
 * The values come from EXPO_PUBLIC_FIREBASE_* variables set when the app is
 * built (see .env.example), so one codebase builds the staging app and the
 * production app. They identify the project; they are not secrets -- access
 * is decided by the login and the server's rules.
 */
import { setBackend } from "@/web/runtime";
import { FirebaseBackend, createFirebaseBackend } from "./firebase";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** Set to a host (e.g. 127.0.0.1) to use the local Firebase emulators. */
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || undefined;

let backend: FirebaseBackend | null = null;

/** Connects to Firebase (once) and makes it the app's backend. */
export function startBackend(): FirebaseBackend {
  if (!backend) {
    if (!config.projectId || !config.apiKey) {
      throw new Error("This build has no Firebase project set. Add the EXPO_PUBLIC_FIREBASE_* values and rebuild.");
    }
    backend = createFirebaseBackend({ config, emulatorHost });
    setBackend(backend);
  }
  return backend;
}
