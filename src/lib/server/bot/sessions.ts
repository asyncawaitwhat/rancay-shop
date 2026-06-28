/**
 * WhatsApp conversation sessions. One document per customer phone number
 * (doc id == normalised phone) tracking language, status, the active cart, and
 * the linked ERP customer.
 */

import {
  adminGetDoc,
  adminSet,
  adminUpdate,
  serverTimestamp,
} from "../firestore-rest";
import type { WhatsappSession, WhatsappSessionStatus } from "../../types";

const C = "whatsappSessions";

/** Guess the customer's language from their message (Arabic script => ar). */
export function detectLanguage(
  text: string,
  fallback: "ar" | "en"
): "ar" | "en" {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[a-zA-Z]/.test(text)) return "en";
  return fallback;
}

export async function getSession(phone: string): Promise<WhatsappSession | null> {
  return adminGetDoc<WhatsappSession>(C, phone);
}

/** Fetch the session for a phone, creating it on first contact. */
export async function getOrCreateSession(params: {
  phone: string;
  waId: string;
  profileName?: string;
  language: "ar" | "en";
}): Promise<WhatsappSession> {
  const existing = await getSession(params.phone);
  if (existing) return existing;

  const session: Omit<WhatsappSession, "id"> = {
    phone: params.phone,
    waId: params.waId,
    profileName: params.profileName || "",
    language: params.language,
    status: "active",
    activeCartId: "",
    customerId: "",
    lastMessageAt: undefined,
    createdAt: undefined,
    updatedAt: undefined,
  };
  await adminSet(C, params.phone, {
    ...session,
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: params.phone, ...session };
}

export async function patchSession(
  phone: string,
  patch: Partial<Omit<WhatsappSession, "id">>
): Promise<void> {
  await adminUpdate(C, phone, { ...patch, updatedAt: serverTimestamp() });
}

export async function setSessionStatus(
  phone: string,
  status: WhatsappSessionStatus
): Promise<void> {
  await adminUpdate(C, phone, {
    status,
    ...(status === "human_handoff" ? { handoffAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function touchSession(
  phone: string,
  lastInboundText: string
): Promise<void> {
  await adminUpdate(C, phone, {
    lastMessageAt: serverTimestamp(),
    lastInboundText: lastInboundText.slice(0, 500),
    updatedAt: serverTimestamp(),
  });
}
