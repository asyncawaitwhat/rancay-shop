/**
 * Client-side WhatsApp admin service (Firebase Web SDK). Used by the in-app
 * WhatsApp screen to configure the bot and monitor conversations. The webhook
 * itself uses the server-side service-account REST client — this file is only
 * for the authenticated admin UI.
 */

import {
  getOne,
  setOne,
  updateOne,
  listDocs,
  orderBy,
  limit,
  where,
} from "../firestore";
import type {
  WhatsappSettings,
  WhatsappSession,
  WhatsappMessage,
} from "../../types";
import { logAudit, type AuditActor } from "./auditLogs";
import { getIdToken } from "../auth";
import { toDate } from "../../utils";

const SETTINGS_C = "whatsappSettings";
const SESSIONS_C = "whatsappSessions";
export const WHATSAPP_SETTINGS_ID = "main";

export const DEFAULT_WHATSAPP_SETTINGS: Omit<WhatsappSettings, "id"> = {
  botEnabled: true,
  aiAutoReplyEnabled: true,
  aiProvider: "openai",
  openaiModel: "gpt-4o-mini",
  geminiModel: "gemini-2.0-flash",
  defaultLanguage: "ar",
  businessName: "",
  welcomeMessage: "",
  handoffContacts: "",
  taxRate: 0,
  deliveryFee: 0,
};

export async function getWhatsappSettings(): Promise<WhatsappSettings> {
  const doc = await getOne<WhatsappSettings>(SETTINGS_C, WHATSAPP_SETTINGS_ID);
  return { id: WHATSAPP_SETTINGS_ID, ...DEFAULT_WHATSAPP_SETTINGS, ...(doc || {}) };
}

export async function saveWhatsappSettings(
  data: Omit<WhatsappSettings, "id" | "updatedAt">,
  actor: AuditActor | null
): Promise<void> {
  await setOne(SETTINGS_C, WHATSAPP_SETTINGS_ID, data, true);
  await logAudit(actor, {
    action: "update",
    entityType: "whatsappSettings",
    entityId: WHATSAPP_SETTINGS_ID,
    description: "Updated WhatsApp bot settings",
    afterData: data,
  });
}

export async function listRecentSessions(max = 50): Promise<WhatsappSession[]> {
  return listDocs<WhatsappSession>(
    SESSIONS_C,
    orderBy("lastMessageAt", "desc"),
    limit(max)
  );
}

/** Resume AI auto-replies for a customer that was in human handoff. */
export async function reactivateSession(
  phone: string,
  actor: AuditActor | null
): Promise<void> {
  await updateOne(SESSIONS_C, phone, { status: "active" });
  await logAudit(actor, {
    action: "update",
    entityType: "whatsappSession",
    entityId: phone,
    description: `Resumed AI for ${phone}`,
  });
}

/** Pause AI auto-replies (human takes over) for a customer. */
export async function pauseSession(
  phone: string,
  actor: AuditActor | null
): Promise<void> {
  await updateOne(SESSIONS_C, phone, { status: "human_handoff" });
  await logAudit(actor, {
    action: "update",
    entityType: "whatsappSession",
    entityId: phone,
    description: `Paused AI (human handoff) for ${phone}`,
  });
}

const MESSAGES_C = "whatsappMessages";

/**
 * Full message log for one phone number, oldest first. Uses an equality query
 * (no composite index needed) and sorts in memory.
 */
export async function listMessagesForPhone(
  phone: string
): Promise<WhatsappMessage[]> {
  const msgs = await listDocs<WhatsappMessage>(
    MESSAGES_C,
    where("phone", "==", phone)
  );
  return msgs.sort(
    (a, b) =>
      (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0)
  );
}

/**
 * Send a WhatsApp message to a customer from the ERP. Goes through the secure
 * server route (the WhatsApp token is server-only), authenticated with the
 * current user's Firebase ID token.
 */
export async function sendWhatsappMessage(
  phone: string,
  text: string,
  pauseAi = false
): Promise<void> {
  const token = await getIdToken();
  const res = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone, text, pauseAi }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Send failed (HTTP ${res.status})`);
  }
}
