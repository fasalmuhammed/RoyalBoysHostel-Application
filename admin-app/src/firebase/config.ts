import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
// The React Native persistence export is supplied by Firebase's native bundle
// at runtime, although its default TypeScript declaration does not expose it.
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

/**
 * Firebase's web/client configuration is an identifier, not a secret. These
 * defaults point at the project already used by this repository's public form.
 * EXPO_PUBLIC_* variables can override every value for a dedicated production
 * project without changing source code.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCUHV5Q9vQmcw1njdkVfZ5us9pMCO_l5qU",
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "hostel-administration-1432a.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "hostel-administration-1432a",
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "hostel-administration-1432a.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "1062495306395",
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
    "1:1062495306395:web:501f7f237d006a5b7bfc3e",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

export const storage = getStorage(app);

