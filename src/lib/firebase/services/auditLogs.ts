import { addDoc, col, listDocs, orderBy, limit, serverTimestamp } from "../firestore";
import type { AuditLog } from "../../types";

export interface AuditActor {
  userId: string;
  userName: string;
}

/**
 * Append an audit log entry. Best-effort: failures are swallowed so that an
 * audit-write problem never blocks the underlying business action.
 */
export async function logAudit(
  actor: AuditActor | null,
  params: {
    action: string;
    entityType: string;
    entityId?: string;
    description: string;
    beforeData?: unknown;
    afterData?: unknown;
  }
): Promise<void> {
  try {
    await addDoc(col("auditLogs"), {
      userId: actor?.userId || "system",
      userName: actor?.userName || "System",
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || "",
      description: params.description,
      beforeData: params.beforeData ? JSON.stringify(params.beforeData) : "",
      afterData: params.afterData ? JSON.stringify(params.afterData) : "",
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Failed to write audit log", e);
  }
}

export async function listAuditLogs(max = 500): Promise<AuditLog[]> {
  return listDocs<AuditLog>("auditLogs", orderBy("createdAt", "desc"), limit(max));
}
