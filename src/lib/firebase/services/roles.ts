import {
  listDocs,
  getOne,
  createDoc,
  updateOne,
  removeOne,
  orderBy,
} from "../firestore";
import type { Role, PermissionMatrix } from "../../types";
import type { RoleForm } from "../../schemas";
import { emptyMatrix } from "../../permissions";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "roles";

export async function listRoles(): Promise<Role[]> {
  return listDocs<Role>(C, orderBy("englishName"));
}

export async function getRole(id: string): Promise<Role | null> {
  return getOne<Role>(C, id);
}

export async function createRole(
  form: RoleForm,
  permissions: PermissionMatrix,
  actor: AuditActor | null
): Promise<string> {
  const data: Omit<Role, "id"> = {
    ...form,
    isSuperAdmin: false,
    permissions: permissions || emptyMatrix(),
  };
  const id = await createDoc(C, data);
  await logAudit(actor, {
    action: "create",
    entityType: "role",
    entityId: id,
    description: `Created role ${form.englishName}`,
    afterData: data,
  });
  return id;
}

export async function updateRole(
  id: string,
  form: RoleForm,
  permissions: PermissionMatrix,
  actor: AuditActor | null
): Promise<void> {
  const before = await getRole(id);
  // Never downgrade a super admin role's permissions.
  const patch: Record<string, unknown> = { ...form };
  if (!before?.isSuperAdmin) patch.permissions = permissions;
  await updateOne(C, id, patch);
  await logAudit(actor, {
    action: "update",
    entityType: "role",
    entityId: id,
    description: `Updated role ${form.englishName} permissions`,
    beforeData: before,
    afterData: { ...form, permissions },
  });
}

export async function deleteRole(id: string, actor: AuditActor | null): Promise<void> {
  const before = await getRole(id);
  if (before?.isSuperAdmin) throw new Error("The Super Admin role cannot be deleted.");
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "role",
    entityId: id,
    description: `Deleted role ${before?.englishName ?? id}`,
    beforeData: before,
  });
}
