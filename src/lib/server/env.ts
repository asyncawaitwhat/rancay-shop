/**
 * Server-side environment configuration for the WhatsApp AI sales bot.
 *
 * These values are read from NON-public environment variables and are ONLY ever
 * touched by trusted backend code (route handlers / server libs). They are never
 * imported by client components, so secrets stay out of the browser bundle.
 *
 * Nothing throws at import time — `validateBotEnv()` returns the list of missing
 * variables so callers (the webhook) can fail gracefully and log a clear error.
 */

export interface BotEnv {
  // WhatsApp Cloud API
  whatsappToken: string;
  whatsappPhoneNumberId: string;
  whatsappVerifyToken: string;
  whatsappAppSecret: string;
  // AI providers
  openaiApiKey: string;
  geminiApiKey: string;
  // Firebase Admin (service account) — used by the edge Firestore REST client
  firebaseProjectId: string;
  firebaseClientEmail: string;
  firebasePrivateKey: string;
  // Optional: public origin used to build product image links for WhatsApp
  publicBaseUrl: string;
}

/** Private keys pasted into env vars usually have literal "\n" — restore them. */
function normalisePrivateKey(raw: string | undefined): string {
  if (!raw) return "";
  let key = raw.trim();
  // Strip surrounding quotes if the value was quoted in the dashboard.
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

/**
 * Read the whole bot environment. Supports either individual service-account
 * fields (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY / FIREBASE_PROJECT_ID) or
 * a single FIREBASE_SERVICE_ACCOUNT_JSON blob. The project id falls back to the
 * public Firebase project id so a single value can be reused.
 */
export function getBotEnv(): BotEnv {
  let projectId = process.env.FIREBASE_PROJECT_ID || "";
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  const jsonBlob = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonBlob && (!clientEmail || !privateKey)) {
    try {
      const sa = JSON.parse(jsonBlob) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      projectId = projectId || sa.project_id || "";
      clientEmail = clientEmail || sa.client_email || "";
      privateKey = privateKey || sa.private_key || "";
    } catch {
      // Ignore — validateBotEnv will report the missing fields.
    }
  }

  if (!projectId) projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";

  return {
    whatsappToken: process.env.WHATSAPP_TOKEN || "",
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    firebaseProjectId: projectId,
    firebaseClientEmail: clientEmail,
    firebasePrivateKey: normalisePrivateKey(privateKey),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  };
}

/** Returns the names of required env vars that are missing/empty. */
export function validateBotEnv(env: BotEnv = getBotEnv()): string[] {
  const required: Record<string, string> = {
    WHATSAPP_TOKEN: env.whatsappToken,
    WHATSAPP_PHONE_NUMBER_ID: env.whatsappPhoneNumberId,
    WHATSAPP_VERIFY_TOKEN: env.whatsappVerifyToken,
    WHATSAPP_APP_SECRET: env.whatsappAppSecret,
    "FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)": env.firebaseProjectId,
    FIREBASE_CLIENT_EMAIL: env.firebaseClientEmail,
    FIREBASE_PRIVATE_KEY: env.firebasePrivateKey,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  // At least ONE AI provider key must be present; the bot's configured provider
  // is checked at request time (see orchestrator).
  if (!env.openaiApiKey && !env.geminiApiKey) {
    missing.push("OPENAI_API_KEY or GEMINI_API_KEY");
  }
  return missing;
}
