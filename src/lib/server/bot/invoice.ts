/**
 * Invoice creation for WhatsApp orders.
 *
 * This produces a NORMAL ERP sales invoice (same `salesInvoices` collection,
 * same number sequence, same line/total shape, same stock movements and client
 * balance updates as the in-app `postInvoice`). The only differences are extra
 * provenance fields (source = "whatsapp", createdBy = "whatsapp-bot", and links
 * back to the WhatsApp session/cart). Everything runs in ONE Firestore
 * transaction so stock is only ever deducted when the invoice write succeeds.
 *
 * The ERP invoice model has no tax / delivery-fee fields, so the invoice totals
 * are derived purely from product lines (ERP-faithful). Tax/delivery from bot
 * settings are recorded as separate provenance fields for reference and are 0 by
 * default — see docs/WHATSAPP_AI_BOT.md.
 */

import {
  runAdminTransaction,
  nextNumberTx,
  serverTimestamp,
  adminAdd,
} from "../firestore-rest";
import { computeTotals } from "../../invoice-math";
import type { Product, WhatsappCart } from "../../types";
import type { CustomerRef } from "./customers";
import { getCart, markCartInvoiced } from "./cart";
import { computeCartTotals } from "./cart";
import type { WhatsappSettings } from "../../types";

const INVOICES = "salesInvoices";
const PRODUCTS = "products";
const STOCK = "stockMovements";
const CLIENTS = "clients";

export interface CreateInvoiceResult {
  ok: boolean;
  error?: string;
  invoiceNumber?: string;
  grandTotal?: number;
  itemCount?: number;
}

const BOT_ACTOR = { userId: "whatsapp-bot", userName: "WhatsApp Bot" };

async function logBotAudit(params: {
  action: string;
  entityId: string;
  description: string;
}): Promise<void> {
  try {
    await adminAdd("auditLogs", {
      userId: BOT_ACTOR.userId,
      userName: BOT_ACTOR.userName,
      action: params.action,
      entityType: "salesInvoice",
      entityId: params.entityId,
      description: params.description,
      beforeData: "",
      afterData: "",
      createdAt: serverTimestamp(),
    });
  } catch {
    /* audit failures must never block the sale */
  }
}

/**
 * Create + post an ERP invoice from the customer's active cart.
 *
 * @param cartId  must be the session's active cart
 * @param customer resolved ERP client
 * @param session phone + session id for provenance
 */
export async function createInvoiceFromCart(params: {
  cartId: string;
  customer: CustomerRef;
  phone: string;
  sessionId: string;
  settings: Pick<WhatsappSettings, "taxRate" | "deliveryFee">;
}): Promise<CreateInvoiceResult> {
  const cart = await getCart(params.cartId);
  if (!cart) return { ok: false, error: "Cart not found." };
  if (cart.status === "invoiced") {
    return {
      ok: false,
      error: "This order was already invoiced.",
      invoiceNumber: cart.invoiceNumber,
    };
  }
  if (!cart.items.length) return { ok: false, error: "Cart is empty." };

  // ERP-faithful line + total computation (reused from the in-app math).
  const rawLines = cart.items.map((i) => ({
    productId: i.productId,
    productSku: i.productSku,
    productEnglishName: i.productEnglishName,
    productArabicName: i.productArabicName,
    quantity: i.quantity,
    price: i.unitPrice,
    discountType: "amount" as const,
    discountValue: 0,
  }));
  const totals = computeTotals(rawLines, "amount", 0);
  const cartTotals = computeCartTotals(cart.items, params.settings);

  const nowIso = new Date().toISOString();

  let invoiceNumber = "";
  try {
    invoiceNumber = await runAdminTransaction(async (tx) => {
      // ---- READS FIRST ----
      const productRefs = cart.items.map((i) => ({
        collection: PRODUCTS,
        id: i.productId,
      }));
      const products = await tx.getDocs<Product>(productRefs);
      cart.items.forEach((item, idx) => {
        const p = products[idx];
        if (!p) throw new Error(`Product ${item.productEnglishName} not found`);
        if (p.status !== "active") {
          throw new Error(`Product ${item.productEnglishName} is not available`);
        }
        if ((Number(p.currentQty) || 0) < item.quantity) {
          throw new Error(
            `Insufficient stock for ${p.englishName} (have ${p.currentQty}, need ${item.quantity})`
          );
        }
      });

      const client = await tx.getDoc<{
        totalSales?: number;
        totalReturns?: number;
        totalPaid?: number;
      }>(CLIENTS, params.customer.id);

      const number = await nextNumberTx(tx, "salesInvoices", "INV");

      // ---- WRITES ----
      cart.items.forEach((item, idx) => {
        const p = products[idx] as Product;
        const before = Number(p.currentQty) || 0;
        const after = before - item.quantity;
        tx.update(PRODUCTS, item.productId, {
          currentQty: after,
          updatedAt: serverTimestamp(),
        });
        tx.set(STOCK, `${number}_${item.productId}`, {
          productId: item.productId,
          productSku: item.productSku,
          productEnglishName: item.productEnglishName,
          productArabicName: item.productArabicName,
          type: "sale",
          quantity: -item.quantity,
          qtyBefore: before,
          qtyAfter: after,
          referenceType: "salesInvoice",
          referenceId: number,
          referenceNumber: number,
          notes: "WhatsApp order",
          createdBy: BOT_ACTOR.userId,
          createdByName: BOT_ACTOR.userName,
          createdAt: serverTimestamp(),
        });
      });

      tx.set(INVOICES, number, {
        invoiceNumber: number,
        invoiceDate: nowIso,
        status: "posted",
        // ERP client fields
        clientId: params.customer.id,
        clientEnglishName: params.customer.englishName,
        clientArabicName: params.customer.arabicName,
        // Lines + ERP totals
        lines: totals.lines,
        subtotal: totals.subtotal,
        itemDiscountTotal: totals.itemDiscountTotal,
        invoiceDiscountType: "amount",
        invoiceDiscountValue: 0,
        invoiceDiscountTotal: totals.invoiceDiscountTotal,
        totalDiscount: totals.totalDiscount,
        grandTotal: totals.grandTotal,
        paidAmount: 0,
        remainingAmount: totals.grandTotal,
        paymentStatus: "unpaid",
        paymentVaultId: "",
        notes: "Order placed via WhatsApp",
        // WhatsApp provenance
        source: "whatsapp",
        createdBy: BOT_ACTOR.userId,
        createdByName: BOT_ACTOR.userName,
        customerPhone: params.phone,
        customerName: params.customer.englishName,
        whatsappSessionId: params.sessionId,
        whatsappCartId: params.cartId,
        whatsappTax: cartTotals.tax,
        whatsappDeliveryFee: cartTotals.deliveryFee,
        whatsappTotal: cartTotals.total,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Client running balances (mirrors postInvoice; paidAmount = 0).
      if (client) {
        const totalSales = (client.totalSales || 0) + totals.grandTotal;
        const totalReturns = client.totalReturns || 0;
        const totalPaid = client.totalPaid || 0;
        tx.update(CLIENTS, params.customer.id, {
          totalSales,
          balance: totalSales - totalReturns - totalPaid,
          lastPurchaseAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      return number;
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }

  // Stock + invoice committed successfully — now mark the cart (best effort).
  await markCartInvoiced(params.cartId, invoiceNumber);
  await logBotAudit({
    action: "post",
    entityId: invoiceNumber,
    description: `WhatsApp invoice ${invoiceNumber} for ${params.phone} (total ${totals.grandTotal})`,
  });

  return {
    ok: true,
    invoiceNumber,
    grandTotal: totals.grandTotal,
    itemCount: cart.items.length,
  };
}

export type { WhatsappCart };
