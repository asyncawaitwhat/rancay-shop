import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";
import { getOne } from "./firestore";
import type { AppUser } from "../types";

export type { FirebaseUser };

export async function signIn(email: string, password: string) {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * Re-verify the currently signed-in user's password. Used to gate destructive
 * actions (e.g. resetting all data). Throws on wrong password / no session.
 */
export async function reauthenticate(password: string): Promise<void> {
  const auth = getFirebaseAuth();
  const current = auth.currentUser;
  if (!current || !current.email) {
    throw new Error("No active session.");
  }
  const credential = EmailAuthProvider.credential(current.email, password);
  await reauthenticateWithCredential(current, credential);
}

export async function signOut() {
  await fbSignOut(getFirebaseAuth());
}

export function watchAuth(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

/** Load the Firestore profile linked to a Firebase Auth UID. */
export async function loadUserProfile(uid: string): Promise<AppUser | null> {
  return getOne<AppUser>("users", uid);
}

/** Map common Firebase auth error codes to friendly messages. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    default:
      return (err as { message?: string })?.message || "Sign in failed.";
  }
}
