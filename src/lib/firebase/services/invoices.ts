import {
  listDocs,
  getOne,
  docRef,
  col,
  collection,
  doc,
  updateOne,
  removeOne,
  orderBy,
  where,
  serverTimestamp,
  runTransaction,
} from "../firestore";
import { getDb } from "../client";
import type { SalesInvoice, Product, Vault } from "../../types";
import type { SalesInvoiceForm } from "../../schemas";
import { computeTotals, paymentStatusOf } from "../../invoice-math";
import { nextNumber } from "../firestore";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "salesInvoices";

export async function listSalesInvoices(): Promise<SalesInvoice[]> {
  return listDocs<SalesInvoice>(C, orderBy("createdAt", "desc"));
}

export async function getSalesInvoice(id: string): Promise<SalesInvoice | null> {
  return getOne<SalesInvoice>(C, id);
}

export async function listClientInvoices(clientId: string): Promise<SalesInvoice[]> {
  return listDocs<SalesInvoice>(C, where("clientId", "==", clientId));
}

interface ClientRef {
  id: string;
  englishName: string;
  arabicName: string;
}

/** Build the persisted invoice object (minus id/number/status) from a form. */
function buildBase(form: SalesInvoiceForm, client: ClientRef) {
  const totals = computeTotals(
    form.lines,
    form.invoiceDiscountType,
    form.invoiceDiscountValue
  );
  const paidAmount = Number(form.paidAmount) || 0;
  const remainingAmount = Math.max(0, totals.grandTotal - paidAmount);
  return {
    invoiceDate: form.invoiceDate,
    clientId: client.id,
    clientEnglishName: client.englishName,
    clientArabicName: client.arabicName,
    salesRepId: form.salesRepId || "",
    salesRepEnglishName: form.salesRepEnglishName || "",
    salesRepArabicName: form.salesRepArabicName || "",
    notes: form.notes || "",
    lines: totals.lines,
    subtotal: totals.subtotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    invoiceDiscountType: form.invoiceDiscountType,
    invoiceDiscountValue: Number(form.invoiceDiscountValue) || 0,
    invoiceDiscountTotal: totals.invoiceDiscountTotal,
    totalDiscount: totals.totalDiscount,
    grandTotal: totals.grandTotal,
    paidAmount,
    remainingAmount,
    paymentStatus: paymentStatusOf(totals.grandTotal, paidAmount),
    paymentVaultId: form.vaultId || "",
  };
}

/** Create a DRAFT invoice (no stock or finance side effects). */
export async function createDraftInvoice(
  form: SalesInvoiceForm,
  client: ClientRef,
  actor: AuditActor | null
): Promise<string> {
  const invoiceNumber = await nextNumber("salesInvoices", "INV");
  const ref = docRef(C, invoiceNumber);
  const base = buildBase(form, client);
  await runTransaction(getDb(), async (tx) => {
    tx.set(ref, {
      invoiceNumber,
      status: "draft",
      ...base,
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await logAudit(actor, {
    action: "create",
    entityType: "salesInvoice",
    entityId: invoiceNumber,
    description: `Created draft invoice ${invoiceNumber}`,
  });
  return invoiceNumber;
}

export async function updateDraftInvoice(
  id: string,
  form: SalesInvoiceForm,
  client: ClientRef,
  actor: AuditActor | null
): Promise<void> {
  const existing = await getSalesInvoice(id);
  if (!existing || existing.status !== "draft") {
    throw new Error("Only draft invoices can be edited.");
  }
  await updateOne(C, id, buildBase(form, client));
  await logAudit(actor, {
    action: "update",
    entityType: "salesInvoice",
    entityId: id,
    description: `Updated draft invoice ${id}`,
  });
}

/**
 * Post an invoice: validate + deduct stock, write stock movements, create the
 * posted invoice, update client balances, and (if paid) create a finance
 * transaction and credit the vault — all atomically.
 *
 * When `existingId` is provided an existing draft is converted to posted.
 */
export async function postInvoice(
  form: SalesInvoiceForm,
  client: ClientRef,
  actor: AuditActor | null,
  existingId?: string
): Promise<string> {
  const base = buildBase(form, client);

  const invoiceId = await runTransaction(getDb(), async (tx) => {
    // ---- READS FIRST (Firestore transaction requirement) ----
    const productSnaps = await Promise.all(
      base.lines.map((l) => tx.get(docRef("products", l.productId)))
    );
    base.lines.forEach((l, i) => {
      const snap = productSnaps[i];
      if (!snap.exists()) throw new Error(`Product ${l.productEnglishName} not found`);
      const p = snap.data() as Product;
      if ((p.currentQty || 0) < l.quantity) {
        throw new Error(
          `Insufficient stock for ${p.englishName} (have ${p.currentQty}, need ${l.quantity})`
        );
      }
    });

    let vaultSnap = null;
    if (base.paidAmount > 0 && base.paymentVaultId) {
      vaultSnap = await tx.get(docRef("vaults", base.paymentVaultId));
      if (!vaultSnap.exists()) throw new Error("Selected vault not found");
    }

    const clientRef = docRef("clients", client.id);
    const clientSnap = await tx.get(clientRef);

    const invoiceNumber = existingId || (await nextNumber("salesInvoices", "INV", 6, tx));
    let transactionNumber = "";
    if (base.paidAmount > 0 && vaultSnap) {
      transactionNumber = await nextNumber("financeTransactions", "TRX", 6, tx);
    }

    // ---- WRITES ----
    base.lines.forEach((l, i) => {
      const p = productSnaps[i].data() as Product;
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
        type: "sale",
        quantity: -l.quantity,
        qtyBefore: before,
        qtyAfter: after,
        referenceType: "salesInvoice",
        referenceId: invoiceNumber,
        referenceNumber: invoiceNumber,
        notes: "",
        createdBy: actor?.userId || "",
        createdByName: actor?.userName || "",
        createdAt: serverTimestamp(),
      });
    });

    const invRef = docRef(C, invoiceNumber);
    tx.set(invRef, {
      invoiceNumber,
      status: "posted",
      ...base,
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Client balances
    if (clientSnap.exists()) {
      const c = clientSnap.data();
      const totalSales = (c.totalSales || 0) + base.grandTotal;
      const totalPaid = (c.totalPaid || 0) + base.paidAmount;
      const totalReturns = c.totalReturns || 0;
      tx.update(clientRef, {
        totalSales,
        totalPaid,
        balance: totalSales - totalReturns - totalPaid,
        lastPurchaseAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Finance: payment received into vault
    if (base.paidAmount > 0 && vaultSnap) {
      const v = vaultSnap.data() as Vault;
      tx.update(docRef("vaults", base.paymentVaultId), {
        currentBalance: (v.currentBalance || 0) + base.paidAmount,
        updatedAt: serverTimestamp(),
      });
      const trxRef = docRef("financeTransactions", transactionNumber);
      tx.set(trxRef, {
        transactionNumber,
        date: base.invoiceDate,
        vaultId: base.paymentVaultId,
        vaultEnglishName: v.englishName,
        vaultArabicName: v.arabicName,
        type: "invoice_payment",
        amount: base.paidAmount,
        referenceType: "salesInvoice",
        referenceId: invoiceNumber,
        referenceNumber: invoiceNumber,
        notes: `Payment on invoice ${invoiceNumber}`,
        createdBy: actor?.userId || "",
        createdByName: actor?.userName || "",
        createdAt: serverTimestamp(),
      });
    }

    return invoiceNumber;
  });

  await logAudit(actor, {
    action: "post",
    entityType: "salesInvoice",
    entityId: invoiceId,
    description: `Posted invoice ${invoiceId} (total ${base.grandTotal})`,
    afterData: base,
  });
  return invoiceId;
}

/** Cancel an invoice. If it was posted, reverse stock, client and finance effects. */
export async function cancelInvoice(
  id: string,
  actor: AuditActor | null
): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const invRef = docRef(C, id);
    const invSnap = await tx.get(invRef);
    if (!invSnap.exists()) throw new Error("Invoice not found");
    const inv = invSnap.data() as SalesInvoice & { paymentVaultId?: string };
    if (inv.status === "cancelled") throw new Error("Invoice already cancelled");

    const wasPosted = inv.status === "posted";

    let productSnaps: Awaited<ReturnType<typeof tx.get>>[] = [];
    let clientSnap = null;
    let vaultSnap = null;
    if (wasPosted) {
      productSnaps = await Promise.all(
        inv.lines.map((l) => tx.get(docRef("products", l.productId)))
      );
      clientSnap = await tx.get(docRef("clients", inv.clientId));
      if (inv.paidAmount > 0 && inv.paymentVaultId) {
        vaultSnap = await tx.get(docRef("vaults", inv.paymentVaultId));
      }
    }

    tx.update(invRef, { status: "cancelled", updatedAt: serverTimestamp() });

    if (wasPosted) {
      inv.lines.forEach((l, i) => {
        const snap = productSnaps[i];
        if (!snap.exists()) return;
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
          type: "adjustment",
          quantity: l.quantity,
          qtyBefore: before,
          qtyAfter: after,
          referenceType: "salesInvoiceCancel",
          referenceId: id,
          referenceNumber: id,
          notes: `Reversal of cancelled invoice ${id}`,
          createdBy: actor?.userId || "",
          createdByName: actor?.userName || "",
          createdAt: serverTimestamp(),
        });
      });

      if (clientSnap?.exists()) {
        const c = clientSnap.data();
        const totalSales = (c.totalSales || 0) - inv.grandTotal;
        const totalPaid = (c.totalPaid || 0) - inv.paidAmount;
        const totalReturns = c.totalReturns || 0;
        tx.update(docRef("clients", inv.clientId), {
          totalSales,
          totalPaid,
          balance: totalSales - totalReturns - totalPaid,
          updatedAt: serverTimestamp(),
        });
      }

      if (vaultSnap?.exists()) {
        const v = vaultSnap.data() as Vault;
        tx.update(docRef("vaults", inv.paymentVaultId!), {
          currentBalance: (v.currentBalance || 0) - inv.paidAmount,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });

  await logAudit(actor, {
    action: "cancel",
    entityType: "salesInvoice",
    entityId: id,
    description: `Cancelled invoice ${id}`,
  });
}

export async function deleteDraftInvoice(id: string, actor: AuditActor | null) {
  const inv = await getSalesInvoice(id);
  if (inv && inv.status !== "draft") {
    throw new Error("Only drafts can be deleted. Cancel a posted invoice instead.");
  }
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "salesInvoice",
    entityId: id,
    description: `Deleted draft invoice ${id}`,
  });
}
