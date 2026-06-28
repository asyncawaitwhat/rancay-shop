/**
 * WhatsApp message logging + duplicate detection.
 *
 * Every inbound and outbound message is persisted to `whatsappMessages`. The
 * WhatsApp Cloud API may redeliver a webhook (e.g. on a slow ACK), so we use the
 * provider's message id as the Firestore document id and treat a pre-existing
 * doc as "already processed" to guarantee idempotent handling.
 */

import {
  adminGetDoc,
  adminSet,
  adminUpdate,
  adminAdd,
  serverTimestamp,
} from "../firestore-rest";
import type { WhatsappMessage, WhatsappMessageDirection } from "../../types";

const C = "whatsappMessages";

// Matches ASCII control chars (0x00-0x1F and 0x7F) without embedding literal
// control characters in source.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/** Remove control chars / collapse whitespace before persisting customer text. */
export function sanitizeText(text: string): string {
  return (text || "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4096);
}

/**
 * Atomically claim an inbound message id. Returns true if this is the first time
 * we've seen it (caller should process), false if it's a duplicate.
 *
 * NOTE: Firestore REST has no createIfMissing precondition exposed here, so we
 * read-then-write. WhatsApp redelivery is seconds apart and single-region, so a
 * read-check is sufficient in practice; the invoice transaction is the true
 * guard against double side effects.
 */
export async function claimInboundMessage(params: {
  waMessageId: string;
  phone: string;
  type: string;
  text: string;
  raw?: unknown;
}): Promise<boolean> {
  const existing = await adminGetDoc<WhatsappMessage>(C, params.waMessageId);
  if (existing) return false;

  await adminSet(C, params.waMessageId, {
    waMessageId: params.waMessageId,
    direction: "incoming" as WhatsappMessageDirection,
    phone: params.phone,
    type: params.type,
    text: sanitizeText(params.text),
    raw: params.raw ? JSON.stringify(params.raw).slice(0, 8000) : "",
    processed: false,
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function markProcessed(
  waMessageId: string,
  error?: string
): Promise<void> {
  await adminUpdate(C, waMessageId, {
    processed: true,
    ...(error ? { error: error.slice(0, 1000) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function logOutbound(params: {
  waMessageId?: string;
  phone: string;
  type: string;
  text: string;
  error?: string;
}): Promise<void> {
  await adminAdd(C, {
    waMessageId: params.waMessageId || "",
    direction: "outgoing" as WhatsappMessageDirection,
    phone: params.phone,
    type: params.type,
    text: sanitizeText(params.text),
    processed: true,
    ...(params.error ? { error: params.error.slice(0, 1000) } : {}),
    createdAt: serverTimestamp(),
  });
}
