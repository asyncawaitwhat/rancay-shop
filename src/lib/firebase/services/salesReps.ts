import {
  listDocs,
  getOne,
  setOne,
  updateOne,
  removeOne,
  nextNumber,
  orderBy,
  where,
} from "../firestore";
import type { SalesRep } from "../../types";
import type { SalesRepForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "salesReps";

export async function listSalesReps(): Promise<SalesRep[]> {
  return listDocs<SalesRep>(C, orderBy("englishName"));
}

export async function listActiveSalesReps(): Promise<SalesRep[]> {
  const all = await listSalesReps();
  return all.filter((r) => r.status === "active");
}

export async function getSalesRep(id: string): Promise<SalesRep | null> {
  return getOne<SalesRep>(C, id);
}

/** Find the sales rep linked to a login user (used to scope their invoices). */
export async function getSalesRepByUser(userId: string): Promise<SalesRep | null> {
  if (!userId) return null;
  const matches = await listDocs<SalesRep>(C, where("userId", "==", userId));
  return matches[0] || null;
}

export async function createSalesRep(
  form: SalesRepForm,
  actor: AuditActor | null
): Promise<string> {
  const repCode = await nextNumber("salesReps", "REP");
  const id = repCode;
  const data: Omit<SalesRep, "id"> = {
    repCode,
    englishName: form.englishName,
    arabicName: form.arabicName,
    phone: form.phone || "",
    email: form.email || "",
    userId: form.userId || "",
    status: form.status,
    notes: form.notes || "",
  };
  await setOne(C, id, data);
  await logAudit(actor, {
    action: "create",
    entityType: "salesRep",
    entityId: id,
    description: `Created sales rep ${form.englishName} (${repCode})`,
    afterData: data,
  });
  return id;
}

export async function updateSalesRep(
  id: string,
  form: SalesRepForm,
  actor: AuditActor | null
): Promise<void> {
  const before = await getSalesRep(id);
  await updateOne(C, id, {
    englishName: form.englishName,
    arabicName: form.arabicName,
    phone: form.phone || "",
    email: form.email || "",
    userId: form.userId || "",
    status: form.status,
    notes: form.notes || "",
  });
  await logAudit(actor, {
    action: "update",
    entityType: "salesRep",
    entityId: id,
    description: `Updated sales rep ${form.englishName}`,
    beforeData: before,
    afterData: form,
  });
}

export async function deleteSalesRep(
  id: string,
  actor: AuditActor | null
): Promise<void> {
  const before = await getSalesRep(id);
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "salesRep",
    entityId: id,
    description: `Deleted sales rep ${before?.englishName ?? id}`,
    beforeData: before,
  });
}
