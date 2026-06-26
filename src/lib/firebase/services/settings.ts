import { getOne, setOne } from "../firestore";
import type { BrandSettings } from "../../types";
import type { BrandForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "brandSettings";
export const BRAND_DOC_ID = "main";

export async function getBrand(): Promise<BrandSettings | null> {
  return getOne<BrandSettings>(C, BRAND_DOC_ID);
}

export async function saveBrand(
  form: BrandForm,
  actor: AuditActor | null
): Promise<void> {
  const before = await getBrand();
  await setOne(C, BRAND_DOC_ID, form, true);
  await logAudit(actor, {
    action: "update",
    entityType: "brandSettings",
    entityId: BRAND_DOC_ID,
    description: "Updated brand settings",
    beforeData: before,
    afterData: form,
  });
}
