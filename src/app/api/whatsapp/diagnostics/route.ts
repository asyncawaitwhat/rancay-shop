/**
 * WhatsApp bot diagnostics.
 *
 *   GET /api/whatsapp/diagnostics?token=YOUR_VERIFY_TOKEN
 *
 * Returns a JSON health report (env presence + live Firestore/WhatsApp/OpenAI
 * checks) so you can see why the bot isn't replying. Gated by the verify token
 * so it isn't publicly readable. Never returns secret values.
 */

import { getBotEnv } from "@/lib/server/env";
import { runDiagnostics } from "@/lib/server/bot/diagnostics";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const env = getBotEnv();

  // Require the verify token (or app secret) to view diagnostics.
  const expected = env.whatsappVerifyToken || env.whatsappAppSecret;
  if (!expected || token !== expected) {
    return new Response(
      JSON.stringify({
        error:
          "Unauthorized. Append ?token=YOUR_WHATSAPP_VERIFY_TOKEN to view diagnostics. If WHATSAPP_VERIFY_TOKEN is itself unset, that is your problem — set the server env vars and redeploy.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const origin = env.publicBaseUrl || url.origin;
  const report = await runDiagnostics(origin);

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
