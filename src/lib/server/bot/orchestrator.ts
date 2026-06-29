/**
 * AI orchestrator. Runs the function-calling loop for the configured provider
 * (OpenAI or Google Gemini): the model receives the customer message + short
 * history, may request approved ERP tools, and we execute them server-side until
 * it produces a final WhatsApp-friendly reply.
 *
 * The model is a SALES ASSISTANT only — it never writes to Firebase and never
 * invents prices, stock, totals, invoice numbers, discounts, taxes or images.
 * Both providers share the SAME tools (`executeTool`) and system prompt, so
 * behaviour is identical regardless of which provider is selected.
 */

import { getBotEnv } from "../env";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools";
import type { WhatsappSession, WhatsappSettings } from "../../types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_TOOL_ROUNDS = 6;

type HistoryTurn = { role: "user" | "assistant"; content: string };

// ---------------------------------------------------------------------------
// System prompt (provider-agnostic)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

async function callOpenAI(
  model: string,
  apiKey: string,
  messages: OpenAiMessage[]
): Promise<OpenAiMessage> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: OpenAiMessage }[] };
  return data.choices[0].message;
}

async function runOpenAI(
  systemPrompt: string,
  priorHistory: HistoryTurn[],
  incomingText: string,
  ctx: ToolContext,
  model: string,
  apiKey: string
): Promise<string> {
  const messages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
    ...priorHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: incomingText },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const assistant = await callOpenAI(model, apiKey, messages);
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
      continue;
    }
    return (assistant.content || "").trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

interface RawSchema {
  type?: string;
  description?: string;
  enum?: readonly unknown[];
  properties?: Record<string, RawSchema>;
  required?: readonly string[];
  items?: RawSchema;
}

interface GeminiSchema {
  type?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
}

const GEMINI_TYPES: Record<string, string> = {
  object: "OBJECT",
  string: "STRING",
  integer: "INTEGER",
  number: "NUMBER",
  boolean: "BOOLEAN",
  array: "ARRAY",
};

/** Convert an OpenAI-style JSON schema to Gemini's Schema (uppercase types). */
function toGeminiSchema(schema?: RawSchema): GeminiSchema | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const out: GeminiSchema = {};
  if (schema.type) out.type = GEMINI_TYPES[schema.type] || schema.type.toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = [...schema.enum];
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      const conv = toGeminiSchema(v);
      if (conv) out.properties[k] = conv;
    }
  }
  if (schema.required) out.required = [...schema.required];
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
}

const GEMINI_TOOLS = [
  {
    functionDeclarations: TOOL_DEFINITIONS.map((t) => {
      const params = toGeminiSchema(t.function.parameters as unknown as RawSchema);
      const hasProps = params?.properties && Object.keys(params.properties).length > 0;
      return {
        name: t.function.name,
        description: t.function.description,
        ...(hasProps ? { parameters: params } : {}),
      };
    }),
  },
];

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

async function runGemini(
  systemPrompt: string,
  priorHistory: HistoryTurn[],
  incomingText: string,
  ctx: ToolContext,
  model: string,
  apiKey: string
): Promise<string> {
  const cleanModel = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${apiKey}`;

  const contents: GeminiContent[] = [
    ...priorHistory.map(
      (h): GeminiContent => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })
    ),
    { role: "user", parts: [{ text: incomingText }] },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: GEMINI_TOOLS,
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall) as Required<
      Pick<GeminiPart, "functionCall">
    >[];

    if (calls.length) {
      contents.push({ role: "model", parts });
      const responseParts: GeminiPart[] = [];
      for (const c of calls) {
        const fc = c.functionCall;
        const result = await executeTool(fc.name, fc.args || {}, ctx);
        responseParts.push({
          functionResponse: { name: fc.name, response: result },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    return parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface OrchestratorResult {
  replyText: string;
  ctx: ToolContext;
  history: HistoryTurn[];
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
  const provider = settings.aiProvider || "openai";

  const ctx: ToolContext = {
    phone: session.phone,
    profileName: params.profileName || session.profileName,
    baseUrl: params.baseUrl,
    sessionId: session.id,
    settings,
    outbox: { images: [] },
    flags: { handoff: false, invoiced: false },
  };

  const systemPrompt = buildSystemPrompt(settings, language);
  const priorHistory = (session.history || []).slice(-10);

  let finalText = "";
  if (provider === "gemini") {
    if (!env.geminiApiKey) {
      throw new Error("Gemini is selected but GEMINI_API_KEY is not set.");
    }
    finalText = await runGemini(
      systemPrompt,
      priorHistory,
      params.incomingText,
      ctx,
      settings.geminiModel || "gemini-2.0-flash",
      env.geminiApiKey
    );
  } else {
    if (!env.openaiApiKey) {
      throw new Error("OpenAI is selected but OPENAI_API_KEY is not set.");
    }
    finalText = await runOpenAI(
      systemPrompt,
      priorHistory,
      params.incomingText,
      ctx,
      settings.openaiModel || "gpt-4o-mini",
      env.openaiApiKey
    );
  }

  if (!finalText) {
    finalText =
      language === "ar"
        ? "تمام، كيف بقدر أساعدك أكثر؟"
        : "Okay — how can I help further?";
  }

  const newHistory: HistoryTurn[] = [
    ...priorHistory,
    { role: "user" as const, content: params.incomingText },
    { role: "assistant" as const, content: finalText },
  ].slice(-10);

  return { replyText: finalText, ctx, history: newHistory };
}
