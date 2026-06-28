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
} from "../firestore";
import type { WhatsappSettings, WhatsappSession } from "../../types";
import { logAudit, type AuditActor } from "./auditLogs";

const SETTINGS_C = "whatsappSettings";
const SESSIONS_C = "whatsappSessions";
export const WHATSAPP_SETTINGS_ID = "main";

export const DEFAULT_WHATSAPP_SETTINGS: Omit<WhatsappSettings, "id"> = {
  botEnabled: true,
  aiAutoReplyEnabled: true,
  openaiModel: "gpt-4o-mini",
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
