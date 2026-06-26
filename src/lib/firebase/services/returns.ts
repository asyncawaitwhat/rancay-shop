import {
  listDocs,
  getOne,
  docRef,
  collection,
  doc,
  updateOne,
  removeOne,
  orderBy,
  where,
  serverTimestamp,
  runTransaction,
  nextNumber,
} from "../firestore";
import { getDb } from "../client";
import type { ReturnInvoice, Product } from "../../types";
import type { ReturnInvoiceForm } from "../../schemas";
import { computeTotals } from "../../invoice-math";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "returnInvoices";

export async function listReturnInvoices(): Promise<ReturnInvoice[]> {
  return listDocs<ReturnInvoice>(C, orderBy("createdAt", "desc"));
}

export async function getReturnInvoice(id: string): Promise<ReturnInvoice | null> {
  return getOne<ReturnInvoice>(C, id);
}

export async function listClientReturns(clientId: string): Promise<ReturnInvoice[]> {
  return listDocs<ReturnInvoice>(C, where("clientId", "==", clientId));
}

interface ClientRef {
  id: string;
  englishName: string;
  arabicName: string;
}

function buildBase(
  form: ReturnInvoiceForm,
  client: ClientRef,
  originalNumber?: string
) {
  const totals = computeTotals(
    form.lines,
    form.invoiceDiscountType,
    form.invoiceDiscountValue
  );
  return {
    invoiceDate: form.invoiceDate,
    clientId: client.id,
    clientEnglishName: client.englishName,
    clientArabicName: client.arabicName,
    originalInvoiceId: form.originalInvoiceId || "",
    originalInvoiceNumber: originalNumber || "",
    notes: form.notes || "",
    lines: totals.lines,
    subtotal: totals.subtotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    invoiceDiscountType: form.invoiceDiscountType,
    invoiceDiscountValue: Number(form.invoiceDiscountValue) || 0,
    invoiceDiscountTotal: totals.invoiceDiscountTotal,
    totalDiscount: totals.totalDiscount,
    grandTotal: totals.grandTotal,
  };
}

export async function createDraftReturn(
  form: ReturnInvoiceForm,
  client: ClientRef,
  actor: AuditActor | null,
  originalNumber?: string
): Promise<string> {
  const invoiceNumber = await nextNumber("returnInvoices", "RET");
  await runTransaction(getDb(), async (tx) => {
    tx.set(docRef(C, invoiceNumber), {
      invoiceNumber,
      status: "draft",
      ...buildBase(form, client, originalNumber),
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await logAudit(actor, {
    action: "create",
    entityType: "returnInvoice",
    entityId: invoiceNumber,
    description: `Created draft return ${invoiceNumber}`,
  });
  return invoiceNumber;
}

export async function updateDraftReturn(
  id: string,
  form: ReturnInvoiceForm,
  client: ClientRef,
  actor: AuditActor | null,
  originalNumber?: string
): Promise<void> {
  const existing = await getReturnInvoice(id);
  if (!existing || existing.status !== "draft") {
    throw new Error("Only draft returns can be edited.");
  }
  await updateOne(C, id, buildBase(form, client, originalNumber));
  await logAudit(actor, {
    action: "update",
    entityType: "returnInvoice",
    entityId: id,
    description: `Updated draft return ${id}`,
  });
}

/**
 * Post a return invoice: add stock back, write stock movements, reduce the
 * client's outstanding balance (totalReturns), all atomically. A returned
 * amount lowers what the client owes — that is the finance effect. No cash is
 * removed from a vault automatically (refunds, if any, are recorded separately).
 */
export async function postReturn(
  form: ReturnInvoiceForm,
  client: ClientRef,
  actor: AuditActor | null,
  existingId?: string,
  originalNumber?: string
): Promise<string> {
  const base = buildBase(form, client, originalNumber);

  const returnId = await runTransaction(getDb(), async (tx) => {
    const productSnaps = await Promise.all(
      base.lines.map((l) => tx.get(docRef("products", l.productId)))
    );
    const clientRef = docRef("clients", client.id);
    const clientSnap = await tx.get(clientRef);

    const invoiceNumber = existingId || (await nextNumber("returnInvoices", "RET", 6, tx));

    base.lines.forEach((l, i) => {
      const snap = productSnaps[i];
      if (!snap.exists()) throw new Error(`Product ${l.productEnglishName} not found`);
      const p = snap.data() as Product;
      const before = p.currentQty || 0;
      const after = before + l.quantity;
      tx.update(docRef("products", l.productId), {
        currentQty: after,
        updatedAt: serverTimestamp(),
      });
      const moveRef = doc(collection(getDb(), "stockMovements"));
      tx.set(moveRef, {
        productId: l.productId,
        productSku: l.productSku,
        productEnglishName: l.productEnglishName,
        productArabicName: l.productArabicName,
        type: "return",
        quantity: l.quantity,
        qtyBefore: before,
        qtyAfter: after,
        referenceType: "returnInvoice",
        referenceId: invoiceNumber,
        referenceNumber: invoiceNumber,
        notes: "",
        createdBy: actor?.userId || "",
        createdByName: actor?.userName || "",
        createdAt: serverTimestamp(),
      });
    });

    tx.set(docRef(C, invoiceNumber), {
      invoiceNumber,
      status: "posted",
      ...base,
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (clientSnap.exists()) {
      const c = clientSnap.data();
      const totalReturns = (c.totalReturns || 0) + base.grandTotal;
      const totalSales = c.totalSales || 0;
      const totalPaid = c.totalPaid || 0;
      tx.update(clientRef, {
        totalReturns,
        balance: totalSales - totalReturns - totalPaid,
        updatedAt: serverTimestamp(),
      });
    }

    return invoiceNumber;
  });

  await logAudit(actor, {
    action: "post",
    entityType: "returnInvoice",
    entityId: returnId,
    description: `Posted return ${returnId} (total ${base.grandTotal})`,
    afterData: base,
  });
  return returnId;
}

export async function cancelReturn(id: string, actor: AuditActor | null): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const ref = docRef(C, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Return not found");
    const ret = snap.data() as ReturnInvoice;
    if (ret.status === "cancelled") throw new Error("Already cancelled");
    const wasPosted = ret.status === "posted";

    let productSnaps: Awaited<ReturnType<typeof tx.get>>[] = [];
    let clientSnap = null;
    if (wasPosted) {
      productSnaps = await Promise.all(
        ret.lines.map((l) => tx.get(docRef("products", l.productId)))
      );
      clientSnap = await tx.get(docRef("clients", ret.clientId));
    }

    tx.update(ref, { status: "cancelled", updatedAt: serverTimestamp() });

    if (wasPosted) {
      ret.lines.forEach((l, i) => {
        const ps = productSnaps[i];
        if (!ps.exists()) return;
        const p = ps.data() as Product;
        const before = p.currentQty || 0;
        const after = before - l.quantity;
        tx.update(docRef("products", l.productId), {
          currentQty: after,
          updatedAt: serverTimestamp(),
        });
        const moveRef = doc(collection(getDb(), "stockMovements"));
        tx.set(moveRef, {
          productId: l.productId,
          productSku: l.productSku,
          productEnglishName: l.productEnglishName,
          productArabicName: l.productArabicName,
          type: "adjustment",
          quantity: -l.quantity,
          qtyBefore: before,
          qtyAfter: after,
          referenceType: "returnInvoiceCancel",
          referenceId: id,
          referenceNumber: id,
          notes: `Reversal of cancelled return ${id}`,
          createdBy: actor?.userId || "",
          createdByName: actor?.userName || "",
          createdAt: serverTimestamp(),
        });
      });
      if (clientSnap?.exists()) {
        const c = clientSnap.data();
        const totalReturns = (c.totalReturns || 0) - ret.grandTotal;
        const totalSales = c.totalSales || 0;
        const totalPaid = c.totalPaid || 0;
        tx.update(docRef("clients", ret.clientId), {
          totalReturns,
          balance: totalSales - totalReturns - totalPaid,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });
  await logAudit(actor, {
    action: "cancel",
    entityType: "returnInvoice",
    entityId: id,
    description: `Cancelled return ${id}`,
  });
}

export async function deleteDraftReturn(id: string, actor: AuditActor | null) {
  const ret = await getReturnInvoice(id);
  if (ret && ret.status !== "draft") {
    throw new Error("Only drafts can be deleted. Cancel a posted return instead.");
  }
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "returnInvoice",
    entityId: id,
    description: `Deleted draft return ${id}`,
  });
}
