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
import { logInfo, logWarn, logError } from "./logger";

async function reply(
  phone: string,
  text: string,
  waMessageId?: string
): Promise<void> {
  const res = await sendText(phone, text);
  await logOutbound({
    waMessageId: res.id,
    phone,
    type: "text",
    text,
    error: res.error,
  });
  if (!res.ok) {
    await logError("send", "Failed to send WhatsApp text reply", {
      phone,
      waMessageId,
      detail: res.error,
    });
  }
}

export async function handleInboundMessage(
  msg: ParsedMessage,
  baseUrl: string
): Promise<void> {
  await logInfo("handler", `Inbound ${msg.type} message`, {
    phone: msg.from,
    waMessageId: msg.waMessageId,
    context: { type: msg.type, supported: msg.supported },
  });
  try {
    // 1. Idempotency — claim the message id; bail on duplicates. This is the
    //    FIRST Firestore call, so an auth/config failure surfaces here and we
    //    still try to send a fallback below instead of going silent.
    const isNew = await claimInboundMessage({
      waMessageId: msg.waMessageId,
      phone: msg.from,
      type: msg.type,
      text: msg.text,
      raw: msg.raw,
    });
    if (!isNew) {
      await logInfo("handler", "Duplicate message — skipped", {
        phone: msg.from,
        waMessageId: msg.waMessageId,
      });
      return;
    }

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
      await logWarn("handler", "Bot is disabled — message not answered", {
        phone: msg.from,
        waMessageId: msg.waMessageId,
      });
      return;
    }

    // 3. Human handoff in progress — stay silent so staff can take over.
    if (session.status === "human_handoff") {
      await markProcessed(msg.waMessageId, "human handoff active");
      await logInfo("handler", "Human handoff active — AI stayed silent", {
        phone: msg.from,
        waMessageId: msg.waMessageId,
      });
      return;
    }

    // 4. Unsupported message type (voice/image/document/etc.).
    if (!msg.supported || !msg.text) {
      const note =
        language === "ar"
          ? "أهلاً! حالياً بقدر أساعدك بالرسائل النصية فقط. اكتبلي شو بتحتاج 🙏"
          : "Hi! I can currently help with text messages only. Please type what you need 🙏";
      await reply(msg.from, note, msg.waMessageId);
      await markProcessed(msg.waMessageId);
      await logInfo("handler", `Unsupported message type (${msg.type})`, {
        phone: msg.from,
        waMessageId: msg.waMessageId,
      });
      return;
    }

    // 5. AI auto-reply disabled — acknowledge politely, no AI.
    if (!settings.aiAutoReplyEnabled) {
      const note =
        language === "ar"
          ? "وصلتنا رسالتك ✅ رح يتواصل معك أحد أفراد الفريق قريباً."
          : "We got your message ✅ a team member will reach out shortly.";
      await reply(msg.from, note, msg.waMessageId);
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
      if (!res.ok) {
        await logError("send", "Failed to send product image", {
          phone: msg.from,
          waMessageId: msg.waMessageId,
          detail: res.error,
          context: { url: img.url },
        });
      }
    }

    // 6b. Send the text reply.
    await reply(msg.from, replyText, msg.waMessageId);

    // 7. Persist rolling history + customer link.
    await patchSession(msg.from, {
      history,
      ...(ctx.customer ? { customerId: ctx.customer.id } : {}),
    });

    await markProcessed(msg.waMessageId);
    await logInfo("handler", "Replied to customer", {
      phone: msg.from,
      waMessageId: msg.waMessageId,
      context: {
        provider: settings.aiProvider,
        invoiced: ctx.flags.invoiced,
        invoiceNumber: ctx.flags.invoiceNumber,
        handoff: ctx.flags.handoff,
        images: ctx.outbox.images.length,
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await logError("handler", "Processing failed — sent fallback", {
      phone: msg.from,
      waMessageId: msg.waMessageId,
      detail: error,
    });
    const fallback =
      "عذراً، صار خطأ بسيط. ممكن تعيد رسالتك؟ / Sorry, something went wrong. Please try again.";
    try {
      await reply(msg.from, fallback);
    } catch {
      /* ignore secondary failures */
    }
    try {
      await markProcessed(msg.waMessageId, error);
    } catch {
      /* the message doc may not exist if the first write failed */
    }
  }
}
