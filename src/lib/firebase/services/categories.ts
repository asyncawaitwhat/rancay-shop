import {
  listDocs,
  getOne,
  createDoc,
  updateOne,
  removeOne,
  orderBy,
} from "../firestore";
import type { Category } from "../../types";
import type { CategoryForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "categories";

export async function listCategories(): Promise<Category[]> {
  return listDocs<Category>(C, orderBy("englishName"));
}

export async function getCategory(id: string): Promise<Category | null> {
  return getOne<Category>(C, id);
}

export async function createCategory(
  form: CategoryForm,
  actor: AuditActor | null
): Promise<string> {
  const id = await createDoc(C, form);
  await logAudit(actor, {
    action: "create",
    entityType: "category",
    entityId: id,
    description: `Created category ${form.englishName}`,
    afterData: form,
  });
  return id;
}

export async function updateCategory(
  id: string,
  form: CategoryForm,
  actor: AuditActor | null
): Promise<void> {
  const before = await getCategory(id);
  await updateOne(C, id, { ...form });
  await logAudit(actor, {
    action: "update",
    entityType: "category",
    entityId: id,
    description: `Updated category ${form.englishName}`,
    beforeData: before,
    afterData: form,
  });
}

export async function deleteCategory(
  id: string,
  actor: AuditActor | null
): Promise<void> {
  const before = await getCategory(id);
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "category",
    entityId: id,
    description: `Deleted category ${before?.englishName ?? id}`,
    beforeData: before,
  });
}
