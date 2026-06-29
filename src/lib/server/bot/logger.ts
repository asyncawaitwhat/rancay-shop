/**
 * Persistent WhatsApp event/error logging.
 *
 * Cloudflare/edge console logs are ephemeral; this writes a durable trail to the
 * `whatsappLogs` Firestore collection (server-only, via the admin REST client)
 * so you can review what happened — and why something failed — after the fact.
 *
 * All logging is BEST-EFFORT: a logging failure never throws into the caller, so
 * it can never break message handling. Every event is also mirrored to the
 * console for live tailing.
 */

import { adminAdd, serverTimestamp } from "../firestore-rest";
import type { WhatsappLogLevel } from "../../types";

const C = "whatsappLogs";

export interface LogExtra {
  phone?: string;
  waMessageId?: string;
  detail?: string;
  context?: Record<string, unknown>;
}

export async function logEvent(
  level: WhatsappLogLevel,
  source: string,
  message: string,
  extra: LogExtra = {}
): Promise<void> {
  const line = `[whatsapp:${source}] ${message}${extra.detail ? ` — ${extra.detail}` : ""}`;
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else if (level === "warn") console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);

  try {
    await adminAdd(C, {
      level,
      source,
      message: message.slice(0, 1000),
      phone: extra.phone || "",
      waMessageId: extra.waMessageId || "",
      detail: (extra.detail || "").slice(0, 2000),
      context: extra.context ? JSON.stringify(extra.context).slice(0, 2000) : "",
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp] failed to persist log entry:", e);
  }
}

export const logInfo = (source: string, message: string, extra?: LogExtra) =>
  logEvent("info", source, message, extra);
export const logWarn = (source: string, message: string, extra?: LogExtra) =>
  logEvent("warn", source, message, extra);
export const logError = (source: string, message: string, extra?: LogExtra) =>
  logEvent("error", source, message, extra);
