/**
 * OpenAI orchestrator. Runs the function-calling loop: the model receives the
 * customer message + short history, may request approved ERP tools, and we
 * execute them server-side until it produces a final WhatsApp-friendly reply.
 *
 * The model is a SALES ASSISTANT only — it never writes to Firebase and never
 * invents prices, stock, totals, invoice numbers, discounts, taxes or images.
 */

import { getBotEnv } from "../env";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools";
import type { WhatsappSession, WhatsappSettings } from "../../types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_TOOL_ROUNDS = 6;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

function buildSystemPrompt(settings: WhatsappSettings, language: "ar" | "en"): string {
  const business = settings.businessName || "our store";
  return [
    `You are a friendly, concise WhatsApp SALES ASSISTANT for "${business}".`,
    `The customer's language is ${language === "ar" ? "Arabic" : "English"}.`,
    "",
    "LANGUAGE:",
    "- Always reply in the customer's language.",
    "- For Arabic customers, use clear, friendly, natural Jordanian/Levantine Arabic.",
    "- Keep every message short and suitable for WhatsApp (a few lines, simple wording, emojis sparingly).",
    "",
    "HARD RULES (never break these):",
    "- You may ONLY sell products returned by the searchProducts/getProductDetails tools.",
    "- NEVER invent or guess a price, stock quantity, discount, tax, delivery fee, invoice number, product, or image. These ALWAYS come from the ERP tools.",
    "- Always call searchProducts before recommending products.",
    "- Always call getProductDetails before giving detailed product information.",
    "- Only call addToCart when the customer has clearly chosen BOTH a product and a quantity.",
    "- Always call calculateCart (or getCart) before stating any total.",
    "- Only call createInvoice AFTER the customer clearly confirms the order. Then give them the invoice number and a short summary.",
    "- If the product or quantity is unclear, ask one short clarifying question.",
    "- If the customer asks for a human, is angry, or has a complaint, call handoffToHuman and tell them a team member will follow up.",
    "- To show a product photo, call getProductImage (it sends the image to the customer).",
    "",
    "STYLE:",
    "- Refer to products by name and price as returned by the tools.",
    "- When listing search results, show name + price + availability briefly.",
    "- Confirm cart contents and totals using the numbers the tools return, never your own arithmetic.",
  ].join("\n");
}

async function callOpenAI(
  model: string,
  apiKey: string,
  messages: ChatMessage[]
): Promise<ChatMessage> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 600,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices: { message: ChatMessage }[];
  };
  return data.choices[0].message;
}

export interface OrchestratorResult {
  replyText: string;
  ctx: ToolContext;
  history: { role: "user" | "assistant"; content: string }[];
}

/** Run a full assistant turn for one inbound customer message. */
export async function runAssistant(params: {
  session: WhatsappSession;
  settings: WhatsappSettings;
  incomingText: string;
  baseUrl: string;
  profileName?: string;
}): Promise<OrchestratorResult> {
  const env = getBotEnv();
  const { session, settings } = params;
  const language = session.language || settings.defaultLanguage;

  const ctx: ToolContext = {
    phone: session.phone,
    profileName: params.profileName || session.profileName,
    baseUrl: params.baseUrl,
    sessionId: session.id,
    settings,
    outbox: { images: [] },
    flags: { handoff: false, invoiced: false },
  };

  const priorHistory = (session.history || []).slice(-10);
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(settings, language) },
    ...priorHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: params.incomingText },
  ];

  let finalText = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const assistant = await callOpenAI(settings.openaiModel, env.openaiApiKey, messages);
    messages.push(assistant);

    if (assistant.tool_calls && assistant.tool_calls.length) {
      for (const call of assistant.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        const result = await executeTool(call.function.name, args, ctx);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue; // let the model react to tool results
    }

    finalText = (assistant.content || "").trim();
    break;
  }

  if (!finalText) {
    finalText =
      language === "ar"
        ? "تمام، كيف بقدر أساعدك أكثر؟"
        : "Okay — how can I help further?";
  }

  const newHistory = [
    ...priorHistory,
    { role: "user" as const, content: params.incomingText },
    { role: "assistant" as const, content: finalText },
  ].slice(-10);

  return { replyText: finalText, ctx, history: newHistory };
}
