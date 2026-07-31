import React, { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "@/firebase/config";
import { Role, UserProfile } from "@/types";
import { registerForPushNotificationsAsync } from "@/services/notifications";
import { claimPendingApplications } from "@/services/applications";

interface AuthContextValue {
  user: UserProfile | null;
  initializing: boolean;
  login: (email: string, password: string, expectedRole?: Role) => Promise<void>;
  register: (name: string, email: string, password: string, role: Role) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setInitializing(false);
        return;
      }
      const snap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (snap.exists()) {
        setUser(snap.data() as UserProfile);
        registerForPushNotificationsAsync(firebaseUser.uid).catch(() => {});
      } else {
        setUser(null);
      }
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string, expectedRole?: Role) => {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

    if (expectedRole) {
      const snap = await getDoc(doc(db, "users", credential.user.uid));
      const role = snap.exists() ? (snap.data() as UserProfile).role : undefined;
      if (role !== expectedRole) {
        await signOut(auth);
        throw new Error(
          role
            ? `This account is registered as ${role}. Please use the ${role} login instead.`
            : "Account profile not found. Please contact an administrator."
        );
      }
    }
  };

  const register = async (name: string, email: string, password: string, role: Role) => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const profile: UserProfile = {
      uid: credential.user.uid,
      name: name.trim(),
      email: email.trim(),
      role,
      createdAt: Date.now(),
      // New rector accounts start pending; an existing approved rector must approve them
      // (enforced server-side too, see firestore.rules) so registration can't self-elevate.
      ...(role === "rector" ? { status: "pending" as const } : {}),
    };
    await setDoc(doc(db, "users", credential.user.uid), profile);
    setUser(profile);

    if (role === "student") {
      // Best-effort: link any hostel application already submitted via the public
      // web form under this same email. Must never block registration if it fails —
      // the common case is simply that no matching application exists.
      claimPendingApplications(profile.email, profile.uid, profile.name).catch(() => {});
    }
  };

  const logout = () => signOut(auth);

  const resetPassword = (email: string) => sendPasswordResetEmail(auth, email.trim());

  return (
    <AuthContext.Provider value={{ user, initializing, login, register, logout, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
