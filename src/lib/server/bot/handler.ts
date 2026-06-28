/**
 * Top-level inbound message orchestration. Called by the webhook for each parsed
 * message. Owns dedup, language detection, handoff gating, the AI turn, and all
 * outbound sends + logging. Designed to never throw — on failure it sends a safe
 * fallback so the customer is never left hanging.
 */

import type { ParsedMessage } from "../whatsapp/client";
import { sendText, sendImage } from "../whatsapp/client";
import {
  claimInboundMessage,
  markProcessed,
  logOutbound,
} from "./messages";
import {
  getOrCreateSession,
  detectLanguage,
  patchSession,
  touchSession,
} from "./sessions";
import { getWhatsappSettings } from "./settings";
import { runAssistant } from "./orchestrator";

async function reply(phone: string, text: string): Promise<void> {
  const res = await sendText(phone, text);
  await logOutbound({
    waMessageId: res.id,
    phone,
    type: "text",
    text,
    error: res.error,
  });
}

export async function handleInboundMessage(
  msg: ParsedMessage,
  baseUrl: string
): Promise<void> {
  // 1. Idempotency — claim the message id; bail on duplicates.
  const isNew = await claimInboundMessage({
    waMessageId: msg.waMessageId,
    phone: msg.from,
    type: msg.type,
    text: msg.text,
    raw: msg.raw,
  });
  if (!isNew) return;

  try {
    const settings = await getWhatsappSettings();
    const language = detectLanguage(msg.text, settings.defaultLanguage);

    const session = await getOrCreateSession({
      phone: msg.from,
      waId: msg.from,
      profileName: msg.profileName,
      language,
    });
    await touchSession(msg.from, msg.text);

    // 2. Bot globally disabled — log only, no reply.
    if (!settings.botEnabled) {
      await markProcessed(msg.waMessageId, "bot disabled");
      return;
    }

    // 3. Human handoff in progress — stay silent so staff can take over.
    if (session.status === "human_handoff") {
      await markProcessed(msg.waMessageId, "human handoff active");
      return;
    }

    // 4. Unsupported message type (voice/image/document/etc.).
    if (!msg.supported || !msg.text) {
      const note =
        language === "ar"
          ? "أهلاً! حالياً بقدر أساعدك بالرسائل النصية فقط. اكتبلي شو بتحتاج 🙏"
          : "Hi! I can currently help with text messages only. Please type what you need 🙏";
      await reply(msg.from, note);
      await markProcessed(msg.waMessageId);
      return;
    }

    // 5. AI auto-reply disabled — acknowledge politely, no AI.
    if (!settings.aiAutoReplyEnabled) {
      const note =
        language === "ar"
          ? "وصلتنا رسالتك ✅ رح يتواصل معك أحد أفراد الفريق قريباً."
          : "We got your message ✅ a team member will reach out shortly.";
      await reply(msg.from, note);
      await markProcessed(msg.waMessageId);
      return;
    }

    // 6. Run the AI sales assistant.
    const { replyText, ctx, history } = await runAssistant({
      session: { ...session, language },
      settings,
      incomingText: msg.text,
      baseUrl,
      profileName: msg.profileName,
    });

    // 6a. Send any product images the model queued.
    for (const img of ctx.outbox.images) {
      const res = await sendImage(msg.from, img.url, img.caption);
      await logOutbound({
        waMessageId: res.id,
        phone: msg.from,
        type: "image",
        text: img.caption || img.url,
        error: res.error,
      });
    }

    // 6b. Send the text reply.
    await reply(msg.from, replyText);

    // 7. Persist rolling history + customer link.
    await patchSession(msg.from, {
      history,
      ...(ctx.customer ? { customerId: ctx.customer.id } : {}),
    });

    await markProcessed(msg.waMessageId);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[whatsapp] handler error:", error);
    const fallback =
      "عذراً، صار خطأ بسيط. ممكن تعيد رسالتك؟ / Sorry, something went wrong. Please try again.";
    try {
      await reply(msg.from, fallback);
    } catch {
      /* ignore secondary failures */
    }
    await markProcessed(msg.waMessageId, error);
  }
}
