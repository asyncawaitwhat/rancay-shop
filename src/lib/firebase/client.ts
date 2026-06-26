import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase client initialization.
 *
 * All configuration is read from NEXT_PUBLIC_* environment variables (see
 * .env.example). If the required values are missing we DO NOT throw at import
 * time — instead `isFirebaseConfigured` is false and the UI shows a friendly
 * setup screen. This keeps the app from crashing on a fresh clone.
 */

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  // storageBucket is part of the standard config object, but we never use
  // Firebase Storage anywhere — all images are stored as Base64 in Firestore.
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

/**
 * Per-variable presence, evaluated at BUILD time (NEXT_PUBLIC_* values are inlined
 * by Next during the build). Used by the setup screen to show exactly which
 * variables were missing when the bundle was built — the usual deploy gotcha.
 */
export const firebaseEnvStatus: { key: string; present: boolean; required: boolean }[] = [
  { key: "NEXT_PUBLIC_FIREBASE_API_KEY", present: !!firebaseConfig.apiKey, required: true },
  { key: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", present: !!firebaseConfig.authDomain, required: true },
  { key: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", present: !!firebaseConfig.projectId, required: true },
  { key: "NEXT_PUBLIC_FIREBASE_APP_ID", present: !!firebaseConfig.appId, required: true },
  { key: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", present: !!firebaseConfig.messagingSenderId, required: false },
  { key: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", present: !!firebaseConfig.storageBucket, required: false },
];

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

function ensureApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and fill in your Firebase project values."
    );
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(ensureApp());
  return dbInstance;
}
