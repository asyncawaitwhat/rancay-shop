import {
  listDocs,
  getOne,
  setOne,
  updateOne,
  removeOne,
  docRef,
  col,
  addDoc,
  nextNumber,
  orderBy,
  where,
  serverTimestamp,
  runTransaction,
} from "../firestore";
import { getDb } from "../client";
import type { Product, StockMovement, Category } from "../../types";
import type { ProductForm, StockAdjustmentForm } from "../../schemas";
import { logAudit, type AuditActor } from "./auditLogs";

const C = "products";

export async function listProducts(): Promise<Product[]> {
  return listDocs<Product>(C, orderBy("englishName"));
}

export async function getProduct(id: string): Promise<Product | null> {
  return getOne<Product>(C, id);
}

export async function generateSku(): Promise<string> {
  return nextNumber("products", "PRD");
}

function categoryNames(form: ProductForm, categories: Category[]) {
  const cat = categories.find((c) => c.id === form.categoryId);
  return {
    categoryEnglishName: cat?.englishName || "",
    categoryArabicName: cat?.arabicName || "",
  };
}

export async function createProduct(
  form: ProductForm,
  categories: Category[],
  actor: AuditActor | null
): Promise<string> {
  const data: Omit<Product, "id"> = {
    ...form,
    ...categoryNames(form, categories),
  };
  const newId = await addDoc(col(C), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Opening stock movement so the ledger reflects the initial quantity.
  if (form.currentQty > 0) {
    await addDoc(col("stockMovements"), {
      productId: newId.id,
      productSku: form.sku,
      productEnglishName: form.englishName,
      productArabicName: form.arabicName,
      type: "opening",
      quantity: form.currentQty,
      qtyBefore: 0,
      qtyAfter: form.currentQty,
      notes: "Opening stock",
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });
  }
  await logAudit(actor, {
    action: "create",
    entityType: "product",
    entityId: newId.id,
    description: `Created product ${form.englishName} (${form.sku})`,
    afterData: data,
  });
  return newId.id;
}

export async function updateProduct(
  id: string,
  form: ProductForm,
  categories: Category[],
  actor: AuditActor | null
): Promise<void> {
  const before = await getProduct(id);
  await updateOne(C, id, { ...form, ...categoryNames(form, categories) });
  await logAudit(actor, {
    action: "update",
    entityType: "product",
    entityId: id,
    description: `Updated product ${form.englishName}`,
    beforeData: before,
    afterData: form,
  });
}

export async function deleteProduct(
  id: string,
  actor: AuditActor | null
): Promise<void> {
  const before = await getProduct(id);
  await removeOne(C, id);
  await logAudit(actor, {
    action: "delete",
    entityType: "product",
    entityId: id,
    description: `Deleted product ${before?.englishName ?? id}`,
    beforeData: before,
  });
}

export async function listStockMovements(productId?: string): Promise<StockMovement[]> {
  if (productId) {
    return listDocs<StockMovement>(
      "stockMovements",
      where("productId", "==", productId),
      orderBy("createdAt", "desc")
    );
  }
  return listDocs<StockMovement>("stockMovements", orderBy("createdAt", "desc"));
}

export async function listLowStock(): Promise<Product[]> {
  const all = await listProducts();
  return all.filter((p) => p.currentQty <= p.minimumQty);
}

/**
 * Manual stock adjustment. Recomputes the target quantity, writes the product
 * and a stock movement atomically in a Firestore transaction.
 */
export async function adjustStock(
  form: StockAdjustmentForm,
  actor: AuditActor | null
): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const ref = docRef(C, form.productId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Product not found");
    const p = snap.data() as Product;
    const before = p.currentQty || 0;
    let after = before;
    if (form.type === "set") after = form.quantity;
    else if (form.type === "increase") after = before + form.quantity;
    else after = before - form.quantity;
    if (after < 0) throw new Error("Adjustment would make stock negative");

    tx.update(ref, { currentQty: after, updatedAt: serverTimestamp() });
    const moveRef = docRef("stockMovements", `adj_${Date.now()}_${form.productId}`);
    tx.set(moveRef, {
      productId: form.productId,
      productSku: p.sku,
      productEnglishName: p.englishName,
      productArabicName: p.arabicName,
      type: "adjustment",
      quantity: after - before,
      qtyBefore: before,
      qtyAfter: after,
      notes: form.notes || `Manual ${form.type}`,
      createdBy: actor?.userId || "",
      createdByName: actor?.userName || "",
      createdAt: serverTimestamp(),
    });
  });
  await logAudit(actor, {
    action: "adjust",
    entityType: "product",
    entityId: form.productId,
    description: `Stock adjustment (${form.type} ${form.quantity})`,
    afterData: form,
  });
}
