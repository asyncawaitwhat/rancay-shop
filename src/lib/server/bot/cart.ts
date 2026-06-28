/**
 * WhatsApp cart/session management. A cart lives in `whatsappCarts`, is linked to
 * a session, and never carries a price the model supplied — unit prices always
 * come from the live product document. All totals are computed by the backend.
 */

import {
  adminGetDoc,
  adminAdd,
  adminUpdate,
  serverTimestamp,
} from "../firestore-rest";
import { money } from "../../utils";
import type {
  WhatsappCart,
  WhatsappCartItem,
  WhatsappSettings,
} from "../../types";
import { getSession, patchSession } from "./sessions";
import { getProductRaw } from "./products";

const C = "whatsappCarts";

export interface CartTotals {
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  total: number;
}

/** Pure totals computation — the single source of truth for cart money. */
export function computeCartTotals(
  items: WhatsappCartItem[],
  settings: Pick<WhatsappSettings, "taxRate" | "deliveryFee">
): CartTotals {
  const subtotal = money(items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0));
  const discount = 0; // WhatsApp orders carry no ad-hoc discount; ERP can apply later.
  const taxable = money(subtotal - discount);
  const tax = settings.taxRate
    ? money((taxable * Number(settings.taxRate)) / 100)
    : 0;
  const deliveryFee = subtotal > 0 ? money(Number(settings.deliveryFee) || 0) : 0;
  const total = money(taxable + tax + deliveryFee);
  return { subtotal, discount, tax, deliveryFee, total };
}

export async function getCart(cartId: string): Promise<WhatsappCart | null> {
  return adminGetDoc<WhatsappCart>(C, cartId);
}

/** Return the active cart for a phone, creating one if needed. */
export async function getOrCreateActiveCart(
  phone: string
): Promise<WhatsappCart> {
  const session = await getSession(phone);
  const activeId = session?.activeCartId;
  if (activeId) {
    const cart = await getCart(activeId);
    if (cart && cart.status === "active") return cart;
  }

  const empty = {
    phone,
    customerId: session?.customerId || "",
    sessionId: phone,
    items: [] as WhatsappCartItem[],
    subtotal: 0,
    discount: 0,
    tax: 0,
    deliveryFee: 0,
    total: 0,
    status: "active" as const,
  };
  const id = await adminAdd(C, {
    ...empty,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await patchSession(phone, { activeCartId: id });
  return { id, ...empty };
}

async function persistCart(
  cart: WhatsappCart,
  settings: Pick<WhatsappSettings, "taxRate" | "deliveryFee">
): Promise<WhatsappCart> {
  const totals = computeCartTotals(cart.items, settings);
  const next = { ...cart, ...totals };
  await adminUpdate(C, cart.id, {
    items: cart.items,
    ...totals,
    updatedAt: serverTimestamp(),
  });
  return next;
}

export interface AddToCartResult {
  ok: boolean;
  error?: string;
  cart?: WhatsappCart;
}

/**
 * Add a product to the active cart. Validates that the product exists, is
 * active, the quantity is positive, and there is enough stock.
 */
export async function addToCart(
  phone: string,
  productId: string,
  quantity: number,
  settings: Pick<WhatsappSettings, "taxRate" | "deliveryFee">
): Promise<AddToCartResult> {
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive whole number." };
  }
  const product = await getProductRaw(productId);
  if (!product) return { ok: false, error: "Product not found." };
  if (product.status !== "active") {
    return { ok: false, error: "Product is not available." };
  }

  const cart = await getOrCreateActiveCart(phone);
  const existing = cart.items.find((i) => i.productId === productId);
  const newQty = (existing?.quantity || 0) + qty;

  if ((Number(product.currentQty) || 0) < newQty) {
    return {
      ok: false,
      error: `Only ${product.currentQty} unit(s) of ${product.englishName} are in stock.`,
    };
  }

  const unitPrice = Number(product.sellingPrice) || 0;
  const lineTotal = money(unitPrice * newQty);
  if (existing) {
    existing.quantity = newQty;
    existing.unitPrice = unitPrice;
    existing.lineTotal = lineTotal;
  } else {
    cart.items.push({
      productId,
      productSku: product.sku,
      productEnglishName: product.englishName,
      productArabicName: product.arabicName,
      quantity: qty,
      unitPrice,
      lineTotal,
    });
  }

  const saved = await persistCart(cart, settings);
  return { ok: true, cart: saved };
}

export async function removeFromCart(
  phone: string,
  productId: string,
  settings: Pick<WhatsappSettings, "taxRate" | "deliveryFee">
): Promise<AddToCartResult> {
  const cart = await getOrCreateActiveCart(phone);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => i.productId !== productId);
  if (cart.items.length === before) {
    return { ok: false, error: "Item not in cart.", cart };
  }
  const saved = await persistCart(cart, settings);
  return { ok: true, cart: saved };
}

/** Recompute and persist totals for the active cart (backend authority). */
export async function calculateCart(
  phone: string,
  settings: Pick<WhatsappSettings, "taxRate" | "deliveryFee">
): Promise<WhatsappCart> {
  const cart = await getOrCreateActiveCart(phone);
  return persistCart(cart, settings);
}

export async function markCartInvoiced(
  cartId: string,
  invoiceNumber: string
): Promise<void> {
  await adminUpdate(C, cartId, {
    status: "invoiced",
    invoiceNumber,
    updatedAt: serverTimestamp(),
  });
}

export async function setCartStatus(
  cartId: string,
  status: WhatsappCart["status"]
): Promise<void> {
  await adminUpdate(C, cartId, { status, updatedAt: serverTimestamp() });
}
