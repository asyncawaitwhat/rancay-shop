import {
  listDocs,
  getOne,
  setOne,
  updateOne,
  removeOne,
  docRef,
  nextNumber,
  orderBy,
  serverTimestamp,
  runTransaction,
} from "../firestore";
import { getDb } from "../client";
import type { Client } from "../../types";
import type { ClientForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "clients";

export async function listClients(): Promise<Client[]> {
  return listDocs<Client>(C, orderBy("englishName"));
}

export async function getClient(id: string): Promise<Client | null> {
  return getOne<Client>(C, id);
}

export async function createClient(
  form: ClientForm,
  actor: AuditActor | null
): Promise<string> {
  const clientCode = await nextNumber("clients", "CL");
  const id = clientCode; // human-readable, unique id
  const data: Omit<Client, "id"> = {
    clientCode,
    ...form,
    totalSales: 0,
    totalReturns: 0,
    totalPaid: 0,
    balance: 0,
  };
  await setOne(C, id, data);
  await logAudit(actor, {
    action: "create",
    entityType: "client",
    entityId: id,
    description: `Created client ${form.englishName} (${clientCode})`,
    afterData: data,
  });
  return id;
}

export async function updateClient(
  id: string,
  form: ClientForm,
  actor: AuditActor | null
): Promise<void> {
  const before = await getClient(id);
  await updateOne(C, id, { ...form });
  await logAudit(actor, {
    action: "update",
    entityType: "client",
    entityId: id,
    description: `Updated client ${form.englishName}`,
    beforeData: before,
    afterData: form,
  });
}

export async function deleteClient(
  id: string,
  actor: AuditActor | null
): Promise<void> {
  const before = await getClient(id);
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "client",
    entityId: id,
    description: `Deleted client ${before?.englishName ?? id}`,
    beforeData: before,
  });
}

/**
 * Atomically apply deltas to a client's running balances. Used by invoices,
 * returns and receipts. All deltas are added to the stored value.
 */
export async function applyClientDeltas(
  clientId: string,
  deltas: {
    totalSales?: number;
    totalReturns?: number;
    totalPaid?: number;
    lastPurchaseAt?: Date;
  }
): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const ref = docRef(C, clientId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const c = snap.data() as Client;
    const totalSales = (c.totalSales || 0) + (deltas.totalSales || 0);
    const totalReturns = (c.totalReturns || 0) + (deltas.totalReturns || 0);
    const totalPaid = (c.totalPaid || 0) + (deltas.totalPaid || 0);
    const balance = totalSales - totalReturns - totalPaid;
    const patch: Record<string, unknown> = {
      totalSales,
      totalReturns,
      totalPaid,
      balance,
      updatedAt: serverTimestamp(),
    };
    if (deltas.lastPurchaseAt) patch.lastPurchaseAt = deltas.lastPurchaseAt;
    tx.update(ref, patch);
  });
}
