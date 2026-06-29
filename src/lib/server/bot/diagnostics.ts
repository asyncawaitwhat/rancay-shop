/**
 * Self-diagnostics for the WhatsApp bot. Verifies, at runtime, that every
 * dependency the webhook needs is actually configured and reachable:
 *   - required env vars are present
 *   - the Firebase service account authenticates against Firestore
 *   - the WhatsApp token + phone number id are valid (Graph API)
 *   - the OpenAI key is valid
 *
 * Never returns secret VALUES — only booleans + provider error messages.
 */

import { getBotEnv, validateBotEnv } from "../env";
import { adminHealthCheck } from "../firestore-rest";

interface Check {
  ok: boolean;
  error?: string;
  info?: unknown;
}

async function checkWhatsapp(): Promise<Check> {
  const env = getBotEnv();
  if (!env.whatsappToken) return { ok: false, error: "WHATSAPP_TOKEN missing" };
  if (!env.whatsappPhoneNumberId)
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID missing" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${env.whatsappPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${env.whatsappToken}` } }
    );
    const data = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) {
      return { ok: false, error: data.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, info: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkOpenAI(): Promise<Check> {
  const env = getBotEnv();
  if (!env.openaiApiKey) return { ok: false, error: "OPENAI_API_KEY not set" };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${env.openaiApiKey}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return { ok: false, error: data.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkGemini(): Promise<Check> {
  const env = getBotEnv();
  if (!env.geminiApiKey) return { ok: false, error: "GEMINI_API_KEY not set" };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${env.geminiApiKey}`
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return { ok: false, error: data.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface Diagnostics {
  ok: boolean;
  webhookUrl: string;
  env: { name: string; present: boolean }[];
  missingEnv: string[];
  firestore: Check;
  whatsapp: Check;
  openai: Check;
  gemini: Check;
  hint: string;
}

export async function runDiagnostics(origin: string): Promise<Diagnostics> {
  const env = getBotEnv();
  const missingEnv = validateBotEnv(env);

  const present = (v: string) => Boolean(v);
  const envList = [
    { name: "WHATSAPP_TOKEN", present: present(env.whatsappToken) },
    { name: "WHATSAPP_PHONE_NUMBER_ID", present: present(env.whatsappPhoneNumberId) },
    { name: "WHATSAPP_VERIFY_TOKEN", present: present(env.whatsappVerifyToken) },
    { name: "WHATSAPP_APP_SECRET", present: present(env.whatsappAppSecret) },
    { name: "OPENAI_API_KEY", present: present(env.openaiApiKey) },
    { name: "GEMINI_API_KEY", present: present(env.geminiApiKey) },
    { name: "FIREBASE_PROJECT_ID", present: present(env.firebaseProjectId) },
    { name: "FIREBASE_CLIENT_EMAIL", present: present(env.firebaseClientEmail) },
    { name: "FIREBASE_PRIVATE_KEY", present: present(env.firebasePrivateKey) },
    { name: "PUBLIC_BASE_URL (optional)", present: present(env.publicBaseUrl) },
  ];

  // Only run live checks for things that are configured, to avoid noise.
  const [firestore, whatsapp, openai, gemini] = await Promise.all([
    env.firebaseClientEmail && env.firebasePrivateKey
      ? adminHealthCheck()
      : Promise.resolve<Check>({ ok: false, error: "service account not configured" }),
    checkWhatsapp(),
    checkOpenAI(),
    checkGemini(),
  ]);

  // At least one AI provider must work; the bot uses whichever is selected.
  const anyAi = openai.ok || gemini.ok;
  const ok = missingEnv.length === 0 && firestore.ok && whatsapp.ok && anyAi;

  let hint = "All checks passed. If WhatsApp still doesn't reply, the issue is on Meta's side: make sure the webhook Callback URL points here, it is Verified, and the WhatsApp Business Account is subscribed to the 'messages' field.";
  if (missingEnv.length) {
    hint = `Missing env vars: ${missingEnv.join(", ")}. Set them as runtime/secret variables where the app is deployed, then redeploy.`;
  } else if (!firestore.ok) {
    hint = "Firestore admin auth failed — usually the FIREBASE_PRIVATE_KEY is malformed (keep the \\n escapes, wrap in quotes) or the service account is from a different project.";
  } else if (!whatsapp.ok) {
    hint = "WhatsApp token/phone-number-id check failed — the access token may be expired (generate a permanent System User token) or the phone number id is wrong.";
  } else if (!anyAi) {
    hint = "No AI provider is working. Set a valid OPENAI_API_KEY or GEMINI_API_KEY (whichever provider you selected on the WhatsApp Bot screen).";
  }

  return {
    ok,
    webhookUrl: `${origin.replace(/\/+$/, "")}/api/whatsapp/webhook`,
    env: envList,
    missingEnv,
    firestore,
    whatsapp,
    openai,
    gemini,
    hint,
  };
}
