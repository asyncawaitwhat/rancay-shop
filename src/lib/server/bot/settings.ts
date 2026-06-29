/** Server-side reader for the WhatsApp bot configuration document. */

import { adminGetDoc } from "../firestore-rest";
import type { WhatsappSettings } from "../../types";

export const WHATSAPP_SETTINGS_COLLECTION = "whatsappSettings";
export const WHATSAPP_SETTINGS_ID = "main";

export const DEFAULT_WHATSAPP_SETTINGS: WhatsappSettings = {
  id: WHATSAPP_SETTINGS_ID,
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
  const doc = await adminGetDoc<WhatsappSettings>(
    WHATSAPP_SETTINGS_COLLECTION,
    WHATSAPP_SETTINGS_ID
  );
  return { ...DEFAULT_WHATSAPP_SETTINGS, ...(doc || {}) };
}
