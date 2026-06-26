"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { watchAuth, loadUserProfile, signOut as fbSignOut } from "@/lib/firebase/auth";
import { getRole } from "@/lib/firebase/services/roles";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { AppUser, Role } from "@/lib/types";
import type { AuditActor } from "@/lib/firebase/services/auditLogs";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  firebaseReady: boolean;
  user: AppUser | null;
  role: Role | null;
  actor: AuditActor | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Set when a logged-in Firebase user has no/inactive Firestore profile. */
  profileError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  const loadProfile = useCallback(async (id: string) => {
    const profile = await loadUserProfile(id);
    if (!profile) {
      setProfileError(
        "Your account has no profile in the system. Ask an administrator to set one up."
      );
      setUser(null);
      setRole(null);
      return;
    }
    if (profile.status !== "active") {
      setProfileError("Your account is inactive. Contact an administrator.");
      setUser(null);
      setRole(null);
      return;
    }
    setProfileError(null);
    setUser(profile);
    const r = profile.role ? await getRole(profile.role) : null;
    setRole(r);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = watchAuth(async (fbUser) => {
      setLoading(true);
      if (fbUser) {
        setUid(fbUser.uid);
        await loadProfile(fbUser.uid);
      } else {
        setUid(null);
        setUser(null);
        setRole(null);
        setProfileError(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    if (uid) await loadProfile(uid);
  }, [uid, loadProfile]);

  const signOut = useCallback(async () => {
    await fbSignOut();
  }, []);

  const actor: AuditActor | null = user
    ? { userId: user.id, userName: user.name }
    : null;

  return (
    <AuthContext.Provider
      value={{
        configured: isFirebaseConfigured,
        firebaseReady: isFirebaseConfigured,
        loading,
        user,
        role,
        actor,
        refresh,
        signOut,
        profileError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
