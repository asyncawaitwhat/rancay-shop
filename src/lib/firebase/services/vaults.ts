import {
  listDocs,
  getOne,
  createDoc,
  updateOne,
  removeOne,
  orderBy,
} from "../firestore";
import type { Vault } from "../../types";
import type { VaultForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "vaults";

export async function listVaults(): Promise<Vault[]> {
  return listDocs<Vault>(C, orderBy("englishName"));
}

export async function getVault(id: string): Promise<Vault | null> {
  return getOne<Vault>(C, id);
}

export async function createVault(
  form: VaultForm,
  actor: AuditActor | null
): Promise<string> {
  const data: Omit<Vault, "id"> = {
    ...form,
    currentBalance: Number(form.openingBalance) || 0,
  };
  const id = await createDoc(C, data);
  await logAudit(actor, {
    action: "create",
    entityType: "vault",
    entityId: id,
    description: `Created vault ${form.englishName}`,
    afterData: data,
  });
  return id;
}

export async function updateVault(
  id: string,
  form: VaultForm,
  actor: AuditActor | null
): Promise<void> {
  const before = await getVault(id);
  // Adjust current balance by the change in opening balance so manual edits stay consistent.
  const openingDelta = (Number(form.openingBalance) || 0) - (before?.openingBalance || 0);
  const currentBalance = (before?.currentBalance || 0) + openingDelta;
  await updateOne(C, id, { ...form, currentBalance });
  await logAudit(actor, {
    action: "update",
    entityType: "vault",
    entityId: id,
    description: `Updated vault ${form.englishName}`,
    beforeData: before,
    afterData: form,
  });
}

export async function deleteVault(id: string, actor: AuditActor | null): Promise<void> {
  const before = await getVault(id);
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "vault",
    entityId: id,
    description: `Deleted vault ${before?.englishName ?? id}`,
    beforeData: before,
  });
}
