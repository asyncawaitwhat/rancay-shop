/**
 * WhatsApp Cloud API webhook.
 *
 *   GET  → verification handshake (Meta calls this once when you set the webhook)
 *   POST → inbound message callbacks
 *
 * Runs on the edge so it deploys on Cloudflare Pages. All data access goes
 * through the service-account Firestore REST client (server-only).
 */

import { getBotEnv, validateBotEnv } from "@/lib/server/env";
import { verifyWebhookSignature, parseIncoming } from "@/lib/server/whatsapp/client";
import { handleInboundMessage } from "@/lib/server/bot/handler";
import { logInfo, logWarn, logError } from "@/lib/server/bot/logger";

export const runtime = "edge";
// Never cache webhook responses.
export const dynamic = "force-dynamic";

/** GET: respond to Meta's verification challenge. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const env = getBotEnv();
  if (mode === "subscribe" && token && token === env.whatsappVerifyToken) {
    return new Response(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

/** POST: process inbound messages. Always returns 200 so Meta won't disable us. */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  // Configuration sanity check — log clearly but still 200 the webhook.
  const missing = validateBotEnv();
  if (missing.length) {
    await logError("webhook", "Missing required env vars — cannot process", {
      detail: missing.join(", "),
    });
    return new Response("OK", { status: 200 });
  }

  // Signature verification (X-Hub-Signature-256).
  const signature = req.headers.get("x-hub-signature-256");
  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    await logWarn("webhook", "Rejected: invalid X-Hub-Signature-256", {
      detail: signature ? "signature mismatch" : "no signature header",
    });
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await logWarn("webhook", "Rejected: body was not valid JSON");
    return new Response("OK", { status: 200 });
  }

  const messages = parseIncoming(payload);
  // Status callbacks (delivered/read) carry no actionable messages — skip quietly.
  if (!messages.length) return new Response("OK", { status: 200 });
  await logInfo("webhook", `Received ${messages.length} message(s)`);

  const env = getBotEnv();
  const baseUrl = env.publicBaseUrl || new URL(req.url).origin;

  // Process sequentially; the handler is idempotent and self-contained.
  for (const msg of messages) {
    try {
      await handleInboundMessage(msg, baseUrl);
    } catch (e) {
      await logError("webhook", "Unhandled error while handling message", {
        phone: msg.from,
        waMessageId: msg.waMessageId,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return new Response("OK", { status: 200 });
}
