/**
 * Edge-compatible Firebase ID-token verification.
 *
 * The admin UI authenticates with the Firebase Web SDK; when it calls a
 * server route (e.g. to send a WhatsApp message) it passes the user's Firebase
 * ID token in the Authorization header. This module verifies that token on the
 * edge: it checks the RS256 signature against Google's public JWKs and validates
 * the standard claims (issuer, audience = project id, expiry). No firebase-admin.
 */

import { getBotEnv } from "./env";

const JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

let cachedJwks: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < 60 * 60 * 1000) {
    return cachedJwks.keys;
  }
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error("Failed to fetch Firebase public keys");
  const data = (await res.json()) as { keys: Jwk[] };
  cachedJwks = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeJsonPart(part: string): Record<string, unknown> {
  const bytes = base64UrlToBytes(part);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

export interface VerifiedToken {
  uid: string;
  email?: string;
}

/** Verify a Firebase ID token; throws on any failure. Returns the user's uid. */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedToken> {
  const projectId = getBotEnv().firebaseProjectId;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID not configured");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = decodeJsonPart(headerB64) as { kid?: string; alg?: string };
  const payload = decodeJsonPart(payloadB64) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    email?: string;
  };

  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error("Token audience mismatch");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Token issuer mismatch");
  }
  if (!payload.sub) throw new Error("Token has no subject");
  if (!payload.exp || payload.exp < now) throw new Error("Token expired");

  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Signing key not found");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(sigB64) as unknown as BufferSource,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`) as unknown as BufferSource
  );
  if (!valid) throw new Error("Invalid token signature");

  return { uid: payload.sub, email: payload.email };
}
