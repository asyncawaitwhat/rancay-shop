import { getDocs, writeBatch } from "firebase/firestore";
import { getDb } from "../client";
import { col } from "../firestore";
import { logAudit, type AuditActor } from "./auditLogs";

/**
 * Collections wiped by a full data reset. These are the business/operational
 * collections that an active user is allowed to delete under firestore.rules.
 *
 * Deliberately PRESERVED (so the app stays usable / compliant with rules):
 *   - users, roles, brandSettings, whatsappSettings  → app config + access
 *   - auditLogs                                       → rules forbid client delete
 *   - whatsappMessages, whatsappCarts                 → server-write-only (rules)
 */
export const RESETTABLE_COLLECTIONS = [
  "salesInvoices",
  "returnInvoices",
  "stockMovements",
  "financeTransactions",
  "receiptSlips",
  "expenseSlips",
  "products",
  "categories",
  "clients",
  "vaults",
  "salesReps",
  "whatsappSessions",
  "sequences",
] as const;

const BATCH_LIMIT = 400; // Firestore allows 500 writes per batch; stay under it.

/** Delete every document in a collection using chunked batch writes. */
async function wipeCollection(name: string): Promise<number> {
  const snap = await getDocs(col(name));
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(getDb());
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(d.ref);
      deleted++;
    }
    await batch.commit();
  }
  return deleted;
}

/**
 * Permanently delete all business data. The CALLER must re-verify the user's
 * password (see `reauthenticate`) before invoking this. Returns per-collection
 * deletion counts.
 */
export async function resetAllData(
  actor: AuditActor | null
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of RESETTABLE_COLLECTIONS) {
    counts[name] = await wipeCollection(name);
  }
  await logAudit(actor, {
    action: "reset",
    entityType: "system",
    description: `Reset all data: ${Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`,
  });
  return counts;
}
