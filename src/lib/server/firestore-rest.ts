/**
 * Edge-compatible Firestore Admin client (no firebase-admin, no Node APIs).
 *
 * WHY THIS EXISTS
 * ---------------
 * The ERP front-end talks to Firestore through the Firebase Web SDK, which is
 * gated by `firestore.rules` (an authenticated staff user is required). The
 * WhatsApp webhook, however, is a server-to-server callback with no user session,
 * and the app deploys to Cloudflare Pages (Workers / edge runtime) where
 * `firebase-admin` (a Node library) cannot run.
 *
 * This module authenticates with a Google service account by signing a JWT with
 * Web Crypto (RS256), exchanging it for an OAuth2 access token, and calling the
 * Firestore REST API directly. Because it uses a service account it has trusted
 * admin access and bypasses security rules — exactly what a backend integration
 * needs. It runs on both the edge and Node.
 *
 * Everything here is server-only; never import it from a client component.
 */

import { getBotEnv } from "./env";

const FIRESTORE_HOST = "https://firestore.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

// ---------------------------------------------------------------------------
// Firestore typed-value <-> plain JS conversion
// ---------------------------------------------------------------------------

export type FirestoreValue = Record<string, unknown>;
export type FirestoreFields = Record<string, FirestoreValue>;

/** Sentinel returned by `serverTimestamp()`; encoded as the current time. */
export const SERVER_TIMESTAMP = Symbol("serverTimestamp");
export function serverTimestamp(): typeof SERVER_TIMESTAMP {
  return SERVER_TIMESTAMP;
}

function encodeValue(v: unknown): FirestoreValue {
  if (v === SERVER_TIMESTAMP) {
    return { timestampValue: new Date().toISOString() };
  }
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  switch (typeof v) {
    case "boolean":
      return { booleanValue: v };
    case "number":
      return Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    case "string":
      return { stringValue: v };
    case "object": {
      if (Array.isArray(v)) {
        return { arrayValue: { values: v.map(encodeValue) } };
      }
      return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
    }
    default:
      return { nullValue: null };
  }
}

export function encodeFields(obj: Record<string, unknown>): FirestoreFields {
  const fields: FirestoreFields = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue; // omit undefined, mirroring Firestore SDK
    fields[k] = encodeValue(val);
  }
  return fields;
}

function decodeValue(value: FirestoreValue): unknown {
  if (value == null) return null;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue as boolean;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue as number;
  if ("stringValue" in value) return value.stringValue as string;
  if ("timestampValue" in value) return value.timestampValue as string;
  if ("bytesValue" in value) return value.bytesValue as string;
  if ("referenceValue" in value) return value.referenceValue as string;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) {
    const arr = (value.arrayValue as { values?: FirestoreValue[] }).values || [];
    return arr.map(decodeValue);
  }
  if ("mapValue" in value) {
    const f = (value.mapValue as { fields?: FirestoreFields }).fields || {};
    return decodeFields(f);
  }
  return null;
}

export function decodeFields(fields: FirestoreFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

/** Extract the trailing id from a Firestore resource `name`. */
function idFromName(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1];
}

interface FirestoreDocument {
  name: string;
  fields?: FirestoreFields;
}

function docToObject<T>(doc: FirestoreDocument): T {
  return { id: idFromName(doc.name), ...decodeFields(doc.fields || {}) } as T;
}

// ---------------------------------------------------------------------------
// Service-account auth (JWT RS256 via Web Crypto)
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncode(bytes);
}

/** Convert a PEM private key into the ArrayBuffer expected by importKey(pkcs8). */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const env = getBotEnv();
  if (!env.firebaseClientEmail || !env.firebasePrivateKey) {
    throw new Error(
      "Firestore admin not configured: FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY missing."
    );
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: env.firebaseClientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${utf8ToBase64Url(JSON.stringify(header))}.${utf8ToBase64Url(
    JSON.stringify(claim)
  )}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.firebasePrivateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to obtain Google access token: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

function basePath(): string {
  const env = getBotEnv();
  return `projects/${env.firebaseProjectId}/databases/(default)/documents`;
}

function fullName(collection: string, id: string): string {
  return `${basePath()}/${collection}/${id}`;
}

async function api(
  path: string,
  init?: RequestInit & { rawBody?: unknown }
): Promise<unknown> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(`${FIRESTORE_HOST}/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    body: init?.rawBody !== undefined ? JSON.stringify(init.rawBody) : init?.body,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Firestore REST ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Public document operations (non-transactional)
// ---------------------------------------------------------------------------

export async function adminGetDoc<T>(
  collection: string,
  id: string
): Promise<T | null> {
  const doc = (await api(`${basePath()}/${collection}/${encodeURIComponent(id)}`)) as
    | FirestoreDocument
    | null;
  if (!doc) return null;
  return docToObject<T>(doc);
}

export interface QueryFilter {
  field: string;
  op:
    | "EQUAL"
    | "NOT_EQUAL"
    | "LESS_THAN"
    | "LESS_THAN_OR_EQUAL"
    | "GREATER_THAN"
    | "GREATER_THAN_OR_EQUAL"
    | "ARRAY_CONTAINS";
  value: unknown;
}

export interface QueryOptions {
  filters?: QueryFilter[];
  orderBy?: { field: string; direction?: "ASCENDING" | "DESCENDING" }[];
  limit?: number;
}

/** Run a structured query against a single collection. */
export async function adminQuery<T>(
  collection: string,
  options: QueryOptions = {}
): Promise<T[]> {
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: collection }],
  };
  if (options.filters && options.filters.length) {
    const filters = options.filters.map((f) => ({
      fieldFilter: {
        field: { fieldPath: f.field },
        op: f.op,
        value: encodeValue(f.value),
      },
    }));
    structuredQuery.where =
      filters.length === 1
        ? filters[0]
        : { compositeFilter: { op: "AND", filters } };
  }
  if (options.orderBy && options.orderBy.length) {
    structuredQuery.orderBy = options.orderBy.map((o) => ({
      field: { fieldPath: o.field },
      direction: o.direction || "ASCENDING",
    }));
  }
  if (options.limit) structuredQuery.limit = options.limit;

  const rows = (await api(`${basePath()}:runQuery`, {
    method: "POST",
    rawBody: { structuredQuery },
  })) as { document?: FirestoreDocument }[];

  return (rows || [])
    .filter((r) => r.document)
    .map((r) => docToObject<T>(r.document as FirestoreDocument));
}

/** Read an entire collection (small collections only). */
export async function adminListAll<T>(collection: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ pageSize: "300" });
    if (pageToken) qs.set("pageToken", pageToken);
    const page = (await api(`${basePath()}/${collection}?${qs.toString()}`)) as {
      documents?: FirestoreDocument[];
      nextPageToken?: string;
    } | null;
    if (page?.documents) out.push(...page.documents.map((d) => docToObject<T>(d)));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  return out;
}

/** Create a document with a server-generated id. Returns the new id. */
export async function adminAdd(
  collection: string,
  data: Record<string, unknown>
): Promise<string> {
  const doc = (await api(`${basePath()}/${collection}`, {
    method: "POST",
    rawBody: { fields: encodeFields(data) },
  })) as FirestoreDocument;
  return idFromName(doc.name);
}

/** Create or fully overwrite a document at a known id. */
export async function adminSet(
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await api(`${basePath()}:commit`, {
    method: "POST",
    rawBody: {
      writes: [
        {
          update: { name: fullName(collection, id), fields: encodeFields(data) },
        },
      ],
    },
  });
}

/** Patch specific fields of an existing document (others untouched). */
export async function adminUpdate(
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const fieldPaths = Object.keys(data).filter((k) => data[k] !== undefined);
  await api(`${basePath()}:commit`, {
    method: "POST",
    rawBody: {
      writes: [
        {
          update: { name: fullName(collection, id), fields: encodeFields(data) },
          updateMask: { fieldPaths },
        },
      ],
    },
  });
}

export async function adminDelete(collection: string, id: string): Promise<void> {
  await api(`${basePath()}:commit`, {
    method: "POST",
    rawBody: { writes: [{ delete: fullName(collection, id) }] },
  });
}

// ---------------------------------------------------------------------------
// Transactions (atomic read-then-write — used for invoice + stock)
// ---------------------------------------------------------------------------

export interface TxWrite {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  /** When set, only these fields are written (partial update). */
  mask?: string[];
}

export interface TxContext {
  /** Batch-read documents inside the transaction; missing docs are null. */
  getDocs<T>(refs: { collection: string; id: string }[]): Promise<(T | null)[]>;
  getDoc<T>(collection: string, id: string): Promise<T | null>;
  /** Queue a full overwrite. */
  set(collection: string, id: string, data: Record<string, unknown>): void;
  /** Queue a partial update. */
  update(collection: string, id: string, data: Record<string, unknown>): void;
  delete(collection: string, id: string): void;
}

/**
 * Run a read-then-write transaction with optimistic concurrency + retry,
 * mirroring the Firebase SDK contract (all reads must happen before writes).
 */
export async function runAdminTransaction<T>(
  work: (tx: TxContext) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const begin = (await api(`${basePath()}:beginTransaction`, {
      method: "POST",
      rawBody: { options: { readWrite: {} } },
    })) as { transaction: string };
    const transaction = begin.transaction;

    const writes: unknown[] = [];
    let writesStarted = false;

    const ctx: TxContext = {
      async getDocs<U>(refs: { collection: string; id: string }[]) {
        if (writesStarted) {
          throw new Error("All transaction reads must happen before writes.");
        }
        if (!refs.length) return [];
        const documents = refs.map((r) => fullName(r.collection, r.id));
        const rows = (await api(`${basePath()}:batchGet`, {
          method: "POST",
          rawBody: { documents, transaction },
        })) as { found?: FirestoreDocument; missing?: string }[];
        // batchGet may return results out of order — map by resource name.
        const byName = new Map<string, FirestoreDocument>();
        for (const row of rows || []) {
          if (row.found) byName.set(row.found.name, row.found);
        }
        return refs.map((r) => {
          const found = byName.get(fullName(r.collection, r.id));
          return found ? docToObject<U>(found) : null;
        }) as (U | null)[];
      },
      async getDoc<U>(collection: string, id: string) {
        const [doc] = await ctx.getDocs<U>([{ collection, id }]);
        return doc;
      },
      set(collection, id, data) {
        writesStarted = true;
        writes.push({
          update: { name: fullName(collection, id), fields: encodeFields(data) },
        });
      },
      update(collection, id, data) {
        writesStarted = true;
        writes.push({
          update: { name: fullName(collection, id), fields: encodeFields(data) },
          updateMask: {
            fieldPaths: Object.keys(data).filter((k) => data[k] !== undefined),
          },
        });
      },
      delete(collection, id) {
        writesStarted = true;
        writes.push({ delete: fullName(collection, id) });
      },
    };

    try {
      const result = await work(ctx);
      await api(`${basePath()}:commit`, {
        method: "POST",
        rawBody: { writes, transaction },
      });
      return result;
    } catch (err) {
      lastError = err;
      // Roll back so the transaction lock is released before retrying.
      try {
        await api(`${basePath()}:rollback`, {
          method: "POST",
          rawBody: { transaction },
        });
      } catch {
        /* ignore rollback errors */
      }
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("ABORTED") || msg.includes("409") || msg.includes("contention");
      if (!retryable) throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Transaction failed after retries");
}

/**
 * Atomically generate the next formatted document number using the `sequences`
 * collection — the REST equivalent of `nextNumber()` in the Web SDK. Must be
 * called INSIDE a `runAdminTransaction` so it shares the same atomic commit.
 */
export async function nextNumberTx(
  tx: TxContext,
  key: string,
  prefix: string,
  pad = 6
): Promise<string> {
  const seq = await tx.getDoc<{ value?: number }>("sequences", key);
  const current = seq?.value || 0;
  const next = current + 1;
  tx.update("sequences", key, {
    value: next,
    prefix,
    updatedAt: serverTimestamp(),
  });
  return `${prefix}-${String(next).padStart(pad, "0")}`;
}
