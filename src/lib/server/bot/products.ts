/**
 * Product lookups for the bot. The bot may ONLY surface products that come back
 * from these functions — prices and stock are read straight from Firestore so
 * the model can never invent them.
 */

import { adminQuery, adminGetDoc } from "../firestore-rest";
import type { Product } from "../../types";

const C = "products";

/** Public URL WhatsApp can fetch for a product image (see media route). */
export function productImageUrl(
  baseUrl: string,
  productId: string
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/api/whatsapp/media/${encodeURIComponent(
    productId
  )}`;
}

export interface ProductSummary {
  id: string;
  sku: string;
  englishName: string;
  arabicName: string;
  category: string;
  price: number;
  inStock: boolean;
  availableQty: number;
  hasImage: boolean;
  imageUrl: string | null;
}

function toSummary(p: Product, baseUrl: string): ProductSummary {
  const hasImage = Boolean(p.imageBase64);
  return {
    id: p.id,
    sku: p.sku,
    englishName: p.englishName,
    arabicName: p.arabicName,
    category: p.categoryArabicName || p.categoryEnglishName || "",
    price: Number(p.sellingPrice) || 0,
    inStock: (Number(p.currentQty) || 0) > 0,
    availableQty: Number(p.currentQty) || 0,
    hasImage,
    imageUrl: hasImage ? productImageUrl(baseUrl, p.id) : null,
  };
}

/** Tokenised, accent-insensitive-ish search across the important text fields. */
function matches(p: Product, terms: string[]): boolean {
  const haystack = [
    p.englishName,
    p.arabicName,
    p.sku,
    p.barcode,
    p.categoryEnglishName,
    p.categoryArabicName,
    p.brand,
    p.clothingType,
    p.color,
    p.size,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/**
 * Search ACTIVE products by free-text query. Returns at most `limit` summaries.
 * An empty query returns the first active products (useful for "what do you
 * have?").
 */
export async function searchProducts(
  query: string,
  baseUrl: string,
  limit = 6
): Promise<ProductSummary[]> {
  const active = await adminQuery<Product>(C, {
    filters: [{ field: "status", op: "EQUAL", value: "active" }],
  });

  const terms = (query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);

  const filtered = terms.length
    ? active.filter((p) => matches(p, terms))
    : active;

  // Prefer in-stock items, then by name.
  filtered.sort((a, b) => {
    const sa = (Number(a.currentQty) || 0) > 0 ? 0 : 1;
    const sb = (Number(b.currentQty) || 0) > 0 ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (a.englishName || "").localeCompare(b.englishName || "");
  });

  return filtered.slice(0, limit).map((p) => toSummary(p, baseUrl));
}

export interface ProductDetails extends ProductSummary {
  description: string;
  brand?: string;
  color?: string;
  size?: string;
  unit?: string;
}

export async function getProductDetails(
  productId: string,
  baseUrl: string
): Promise<ProductDetails | null> {
  const p = await adminGetDoc<Product>(C, productId);
  if (!p || p.status !== "active") return null;
  return {
    ...toSummary(p, baseUrl),
    description: p.notes || "",
    brand: p.brand,
    color: p.color,
    size: p.size,
    unit: p.unit,
  };
}

/** Raw product (server use only — e.g. invoice line construction). */
export async function getProductRaw(productId: string): Promise<Product | null> {
  return adminGetDoc<Product>(C, productId);
}
