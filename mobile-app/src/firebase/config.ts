import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth } from "firebase/auth";
// @ts-ignore — getReactNativePersistence is resolved from the RN-specific bundle by Metro at
// runtime, but the default `firebase/auth` type declarations (resolved by tsc) don't include it.
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { firebaseConfig } from "./firebaseConfig";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Native platforms need AsyncStorage-backed persistence; web falls back to the default.
export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(app);
export default app;
