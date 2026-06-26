import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
  listDocs,
  getOne,
  setOne,
  updateOne,
  removeOne,
  orderBy,
} from "../firestore";
import { firebaseConfig } from "../client";
import type { AppUser } from "../../types";
import type { UserForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "users";

export async function listUsers(): Promise<AppUser[]> {
  return listDocs<AppUser>(C, orderBy("name"));
}

export async function getUser(id: string): Promise<AppUser | null> {
  return getOne<AppUser>(C, id);
}

/**
 * Create a new staff user. We spin up a SECONDARY Firebase app instance to
 * create the Auth account so the currently-signed-in admin is NOT logged out
 * (createUserWithEmailAndPassword on the primary app would switch sessions).
 * The Firestore profile is then written using the new account's UID.
 */
export async function createUser(
  form: UserForm & { password: string },
  actor: AuditActor | null
): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  try {
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(
      secAuth,
      form.email,
      form.password
    );
    const uid = cred.user.uid;
    const { password: _pw, ...profile } = form;
    void _pw;
    const data: Omit<AppUser, "id"> = {
      firebaseUid: uid,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      status: profile.status,
      language: profile.language,
      avatarBase64: profile.avatarBase64 || "",
    };
    await setOne(C, uid, data);
    await logAudit(actor, {
      action: "create",
      entityType: "user",
      entityId: uid,
      description: `Created user ${form.name} (${form.email})`,
      afterData: data,
    });
    return uid;
  } finally {
    await deleteApp(secondary);
  }
}

export async function updateUser(
  id: string,
  form: UserForm,
  actor: AuditActor | null
): Promise<void> {
  const before = await getUser(id);
  await updateOne(C, id, {
    name: form.name,
    role: form.role,
    status: form.status,
    language: form.language,
    avatarBase64: form.avatarBase64 || "",
  });
  await logAudit(actor, {
    action: "update",
    entityType: "user",
    entityId: id,
    description: `Updated user ${form.name}`,
    beforeData: before,
    afterData: form,
  });
}

export async function setUserLanguage(id: string, language: "ar" | "en") {
  await updateOne(C, id, { language });
}

/**
 * Remove the user's Firestore profile (revokes app access immediately since the
 * app requires a profile). The Auth account itself can be disabled from the
 * Firebase console if needed — client SDK cannot delete other Auth users.
 */
export async function deleteUser(id: string, actor: AuditActor | null): Promise<void> {
  const before = await getUser(id);
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "user",
    entityId: id,
    description: `Removed user profile ${before?.name ?? id}`,
    beforeData: before,
  });
}
