/**
 * Send a manual WhatsApp message from the ERP (staff replying to a customer).
 *
 *   POST /api/whatsapp/send
 *   Authorization: Bearer <Firebase ID token of the logged-in staff user>
 *   body: { phone: string, text: string, pauseAi?: boolean }
 *
 * The WhatsApp token is server-only, so the browser cannot send directly. This
 * route verifies the caller is an active staff user, sends via the Cloud API,
 * logs the outbound message, and optionally pauses the AI (human handoff).
 */

import { getBotEnv, validateBotEnv } from "@/lib/server/env";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-verify";
import { sendText, normalisePhone } from "@/lib/server/whatsapp/client";
import { logOutbound } from "@/lib/server/bot/messages";
import { adminGetDoc } from "@/lib/server/firestore-rest";
import { setSessionStatus, touchSession } from "@/lib/server/bot/sessions";
import { logInfo, logError } from "@/lib/server/bot/logger";
import type { AppUser } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const missing = validateBotEnv();
  if (missing.length) {
    return json({ error: `Server not configured: ${missing.join(", ")}` }, 500);
  }

  // 1. Authenticate the staff user via their Firebase ID token.
  const authHeader = req.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  if (!idToken) return json({ error: "Missing authorization token" }, 401);

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken));
  } catch (e) {
    return json({ error: `Auth failed: ${e instanceof Error ? e.message : e}` }, 401);
  }

  // 2. Confirm the user is an active staff member.
  const user = await adminGetDoc<AppUser>("users", uid);
  if (!user || user.status !== "active") {
    return json({ error: "Not an active user" }, 403);
  }

  // 3. Validate input.
  let body: { phone?: string; text?: string; pauseAi?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const phone = normalisePhone(body.phone || "");
  const text = (body.text || "").trim();
  if (!phone) return json({ error: "phone is required" }, 400);
  if (!text) return json({ error: "text is required" }, 400);

  // 4. Send + log.
  const result = await sendText(phone, text);
  await logOutbound({
    waMessageId: result.id,
    phone,
    type: "text",
    text,
    error: result.error,
  });
  if (!result.ok) {
    await logError("send", "Manual staff message failed", {
      phone,
      detail: result.error,
      context: { by: user.name },
    });
    return json({ error: result.error || "WhatsApp send failed" }, 502);
  }
  await logInfo("send", "Staff sent a manual message", {
    phone,
    context: { by: user.name, pausedAi: Boolean(body.pauseAi) },
  });

  // 5. Optionally pause the AI so it doesn't also reply.
  if (body.pauseAi) {
    try {
      await setSessionStatus(phone, "human_handoff");
    } catch {
      /* non-fatal */
    }
  }
  try {
    await touchSession(phone, `(staff) ${text}`);
  } catch {
    /* session may not exist yet — non-fatal */
  }

  return json({ ok: true, id: result.id });
}
