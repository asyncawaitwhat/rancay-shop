import {
  listDocs,
  getOne,
  docRef,
  removeOne,
  orderBy,
  where,
  serverTimestamp,
  runTransaction,
  nextNumber,
} from "../firestore";
import { getDb } from "../client";
import type {
  FinanceTransaction,
  ExpenseSlip,
  ReceiptSlip,
  Vault,
} from "../../types";
import type { ExpenseForm, ReceiptForm, TransferForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

// --------------------------------------------------------------------------
// Finance transactions ledger
// --------------------------------------------------------------------------
export async function listTransactions(): Promise<FinanceTransaction[]> {
  return listDocs<FinanceTransaction>("financeTransactions", orderBy("createdAt", "desc"));
}

export async function listVaultTransactions(vaultId: string): Promise<FinanceTransaction[]> {
  return listDocs<FinanceTransaction>(
    "financeTransactions",
    where("vaultId", "==", vaultId)
  );
}

// --------------------------------------------------------------------------
// Expense slips — deduct from a vault, create a finance transaction
// --------------------------------------------------------------------------
export async function listExpenses(): Promise<ExpenseSlip[]> {
  return listDocs<ExpenseSlip>("expenseSlips", orderBy("createdAt", "desc"));
}

export async function getExpense(id: string): Promise<ExpenseSlip | null> {
  return getOne<ExpenseSlip>("expenseSlips", id);
}

export async function createExpense(
  form: ExpenseForm,
  actor: AuditActor | null
): Promise<string> {
  const id = await runTransaction(getDb(), async (tx) => {
    const vaultRef = docRef("vaults", form.vaultId);
    const vaultSnap = await tx.get(vaultRef);
    if (!vaultSnap.exists()) throw new Error("Vault not found");
    const v = vaultSnap.data() as Vault;

    const expenseNumber = await nextNumber("expenseSlips", "EXP", 6, tx);
    const transactionNumber = await nextNumber("financeTransactions", "TRX", 6, tx);

    tx.update(vaultRef, {
      currentBalance: (v.currentBalance || 0) - form.amount,
      updatedAt: serverTimestamp(),
    });

    tx.set(docRef("expenseSlips", expenseNumber), {
      expenseNumber,
      date: form.date,
      vaultId: form.vaultId,
      vaultEnglishName: v.englishName,
      vaultArabicName: v.arabicName,
      category: form.category,
      amount: form.amount,
      paidTo: form.paidTo || "",
      notes: form.notes || "",
      attachmentBase64: form.attachmentBase64 || "",
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });

    tx.set(docRef("financeTransactions", transactionNumber), {
      transactionNumber,
      date: form.date,
      vaultId: form.vaultId,
      vaultEnglishName: v.englishName,
      vaultArabicName: v.arabicName,
      type: "expense",
      amount: -form.amount,
      referenceType: "expenseSlip",
      referenceId: expenseNumber,
      referenceNumber: expenseNumber,
      notes: form.category,
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });

    return expenseNumber;
  });

  await logAudit(actor, {
    action: "create",
    entityType: "expenseSlip",
    entityId: id,
    description: `Created expense ${id} (${form.amount})`,
    afterData: form,
  });
  return id;
}

export async function deleteExpense(id: string, actor: AuditActor | null): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const ref = docRef("expenseSlips", id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Expense not found");
    const exp = snap.data() as ExpenseSlip;
    const vaultRef = docRef("vaults", exp.vaultId);
    const vaultSnap = await tx.get(vaultRef);
    // Refund the vault on deletion (reverse the expense).
    if (vaultSnap.exists()) {
      const v = vaultSnap.data() as Vault;
      tx.update(vaultRef, {
        currentBalance: (v.currentBalance || 0) + exp.amount,
        updatedAt: serverTimestamp(),
      });
    }
    tx.delete(ref);
  });
  await logAudit(actor, {
    action: "delete",
    entityType: "expenseSlip",
    entityId: id,
    description: `Deleted expense ${id}`,
  });
}

// --------------------------------------------------------------------------
// Receipt slips — add to a vault, credit the client, create a transaction
// --------------------------------------------------------------------------
export async function listReceipts(): Promise<ReceiptSlip[]> {
  return listDocs<ReceiptSlip>("receiptSlips", orderBy("createdAt", "desc"));
}

export async function getReceipt(id: string): Promise<ReceiptSlip | null> {
  return getOne<ReceiptSlip>("receiptSlips", id);
}

export async function listClientReceipts(clientId: string): Promise<ReceiptSlip[]> {
  return listDocs<ReceiptSlip>("receiptSlips", where("clientId", "==", clientId));
}

interface ClientRef {
  id: string;
  englishName: string;
  arabicName: string;
}

export async function createReceipt(
  form: ReceiptForm,
  client: ClientRef,
  actor: AuditActor | null
): Promise<string> {
  const id = await runTransaction(getDb(), async (tx) => {
    const vaultRef = docRef("vaults", form.vaultId);
    const vaultSnap = await tx.get(vaultRef);
    if (!vaultSnap.exists()) throw new Error("Vault not found");
    const v = vaultSnap.data() as Vault;

    const clientRef = docRef("clients", client.id);
    const clientSnap = await tx.get(clientRef);

    const receiptNumber = await nextNumber("receiptSlips", "REC", 6, tx);
    const transactionNumber = await nextNumber("financeTransactions", "TRX", 6, tx);

    tx.update(vaultRef, {
      currentBalance: (v.currentBalance || 0) + form.amount,
      updatedAt: serverTimestamp(),
    });

    tx.set(docRef("receiptSlips", receiptNumber), {
      receiptNumber,
      date: form.date,
      clientId: client.id,
      clientEnglishName: client.englishName,
      clientArabicName: client.arabicName,
      vaultId: form.vaultId,
      vaultEnglishName: v.englishName,
      vaultArabicName: v.arabicName,
      amount: form.amount,
      paymentMethod: form.paymentMethod,
      notes: form.notes || "",
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });

    if (clientSnap.exists()) {
      const c = clientSnap.data();
      const totalPaid = (c.totalPaid || 0) + form.amount;
      const totalSales = c.totalSales || 0;
      const totalReturns = c.totalReturns || 0;
      tx.update(clientRef, {
        totalPaid,
        balance: totalSales - totalReturns - totalPaid,
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(docRef("financeTransactions", transactionNumber), {
      transactionNumber,
      date: form.date,
      vaultId: form.vaultId,
      vaultEnglishName: v.englishName,
      vaultArabicName: v.arabicName,
      type: "income",
      amount: form.amount,
      referenceType: "receiptSlip",
      referenceId: receiptNumber,
      referenceNumber: receiptNumber,
      notes: `Receipt from ${client.englishName}`,
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });

    return receiptNumber;
  });

  await logAudit(actor, {
    action: "create",
    entityType: "receiptSlip",
    entityId: id,
    description: `Created receipt ${id} (${form.amount})`,
    afterData: form,
  });
  return id;
}

export async function deleteReceipt(id: string, actor: AuditActor | null): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const ref = docRef("receiptSlips", id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Receipt not found");
    const rec = snap.data() as ReceiptSlip;
    const vaultRef = docRef("vaults", rec.vaultId);
    const vaultSnap = await tx.get(vaultRef);
    const clientRef = docRef("clients", rec.clientId);
    const clientSnap = await tx.get(clientRef);

    if (vaultSnap.exists()) {
      const v = vaultSnap.data() as Vault;
      tx.update(vaultRef, {
        currentBalance: (v.currentBalance || 0) - rec.amount,
        updatedAt: serverTimestamp(),
      });
    }
    if (clientSnap.exists()) {
      const c = clientSnap.data();
      const totalPaid = (c.totalPaid || 0) - rec.amount;
      const totalSales = c.totalSales || 0;
      const totalReturns = c.totalReturns || 0;
      tx.update(clientRef, {
        totalPaid,
        balance: totalSales - totalReturns - totalPaid,
        updatedAt: serverTimestamp(),
      });
    }
    tx.delete(ref);
  });
  await logAudit(actor, {
    action: "delete",
    entityType: "receiptSlip",
    entityId: id,
    description: `Deleted receipt ${id}`,
  });
}

// --------------------------------------------------------------------------
// Transfer between vaults
// --------------------------------------------------------------------------
export async function transferBetweenVaults(
  form: TransferForm,
  actor: AuditActor | null
): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const fromRef = docRef("vaults", form.fromVaultId);
    const toRef = docRef("vaults", form.toVaultId);
    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);
    if (!fromSnap.exists() || !toSnap.exists()) throw new Error("Vault not found");
    const from = fromSnap.data() as Vault;
    const to = toSnap.data() as Vault;

    const outNumber = await nextNumber("financeTransactions", "TRX", 6, tx);
    const inNumber = await nextNumber("financeTransactions", "TRX", 6, tx);

    tx.update(fromRef, {
      currentBalance: (from.currentBalance || 0) - form.amount,
      updatedAt: serverTimestamp(),
    });
    tx.update(toRef, {
      currentBalance: (to.currentBalance || 0) + form.amount,
      updatedAt: serverTimestamp(),
    });

    tx.set(docRef("financeTransactions", outNumber), {
      transactionNumber: outNumber,
      date: form.date,
      vaultId: form.fromVaultId,
      vaultEnglishName: from.englishName,
      vaultArabicName: from.arabicName,
      type: "transfer_out",
      amount: -form.amount,
      referenceType: "transfer",
      referenceId: inNumber,
      referenceNumber: `${from.englishName} → ${to.englishName}`,
      notes: form.notes || "",
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });
    tx.set(docRef("financeTransactions", inNumber), {
      transactionNumber: inNumber,
      date: form.date,
      vaultId: form.toVaultId,
      vaultEnglishName: to.englishName,
      vaultArabicName: to.arabicName,
      type: "transfer_in",
      amount: form.amount,
      referenceType: "transfer",
      referenceId: outNumber,
      referenceNumber: `${from.englishName} → ${to.englishName}`,
      notes: form.notes || "",
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });
  });
  await logAudit(actor, {
    action: "transfer",
    entityType: "financeTransaction",
    description: `Transferred ${form.amount} between vaults`,
    afterData: form,
  });
}
