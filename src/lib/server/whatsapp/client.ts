/**
 * WhatsApp Cloud API client (edge-compatible — fetch + Web Crypto only).
 *
 * Handles outbound messages (text / image / interactive buttons), inbound
 * payload parsing, and X-Hub-Signature-256 verification. Server-only.
 */

import { getBotEnv } from "../env";

const GRAPH_VERSION = "v20.0";

function graphUrl(): string {
  const env = getBotEnv();
  return `https://graph.facebook.com/${GRAPH_VERSION}/${env.whatsappPhoneNumberId}/messages`;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function bytesToHex(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

/** Constant-time-ish comparison of two equal-length hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify the X-Hub-Signature-256 header against the raw request body using the
 * app secret. Returns true when valid. If no app secret is configured we skip
 * verification (and log), so local testing without it still works.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const env = getBotEnv();
  if (!env.whatsappAppSecret) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check.");
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.whatsappAppSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );
  return safeEqual(bytesToHex(sig), expected);
}

// ---------------------------------------------------------------------------
// Inbound parsing
// ---------------------------------------------------------------------------

export interface ParsedMessage {
  waMessageId: string;
  from: string; // sender wa id / phone (digits)
  type: string; // text | interactive | image | audio | ...
  text: string; // best-effort extracted text (empty for unsupported types)
  profileName?: string;
  supported: boolean; // true for text + interactive replies we can act on
  raw: unknown;
}

/**
 * Extract actionable messages from a WhatsApp webhook payload. Status callbacks
 * (delivered/read) and other non-message events yield an empty array.
 */
export function parseIncoming(payload: unknown): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  const root = payload as {
    entry?: {
      changes?: {
        value?: {
          messages?: Record<string, unknown>[];
          contacts?: { profile?: { name?: string }; wa_id?: string }[];
        };
      }[];
    }[];
  };
  for (const entry of root.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue;
      const profileName = value.contacts?.[0]?.profile?.name;
      for (const msg of value.messages) {
        const m = msg as {
          id: string;
          from: string;
          type: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        };
        let text = "";
        let supported = false;
        if (m.type === "text") {
          text = m.text?.body?.trim() || "";
          supported = true;
        } else if (m.type === "interactive") {
          const reply = m.interactive?.button_reply || m.interactive?.list_reply;
          text = (reply?.title || reply?.id || "").trim();
          supported = true;
        } else if (m.type === "button") {
          text = m.button?.text?.trim() || "";
          supported = true;
        }
        out.push({
          waMessageId: m.id,
          from: normalisePhone(m.from),
          type: m.type,
          text,
          profileName,
          supported,
          raw: msg,
        });
      }
    }
  }
  return out;
}

/** Strip everything but digits so a phone number can be used as a stable id. */
export function normalisePhone(phone: string): string {
  return (phone || "").replace(/[^\d]/g, "");
}

// ---------------------------------------------------------------------------
// Outbound messages
// ---------------------------------------------------------------------------

async function send(body: Record<string, unknown>): Promise<{
  ok: boolean;
  id?: string;
  error?: string;
}> {
  const env = getBotEnv();
  try {
    const res = await fetch(graphUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      const error = data.error?.message || `HTTP ${res.status}`;
      // eslint-disable-next-line no-console
      console.error("[whatsapp] send failed:", error);
      return { ok: false, error };
    }
    return { ok: true, id: data.messages?.[0]?.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[whatsapp] send error:", error);
    return { ok: false, error };
  }
}

export function sendText(to: string, text: string) {
  return send({
    to,
    type: "text",
    text: { preview_url: false, body: text.slice(0, 4096) },
  });
}

export function sendImage(to: string, link: string, caption?: string) {
  return send({
    to,
    type: "image",
    image: { link, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}

export interface ReplyButton {
  id: string;
  title: string; // max 20 chars
}

/** Interactive reply buttons (max 3, titles truncated to WhatsApp's 20-char limit). */
export function sendButtons(to: string, body: string, buttons: ReplyButton[]) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}
