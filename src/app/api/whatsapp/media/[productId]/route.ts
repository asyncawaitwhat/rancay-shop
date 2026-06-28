/**
 * Public product-image endpoint.
 *
 * The ERP stores product images as Base64 strings inside Firestore (no Firebase
 * Storage). WhatsApp cannot be sent raw Base64 — it needs a fetchable URL. This
 * route reads the product, decodes its Base64 image, and serves it as real
 * binary so the WhatsApp Cloud API can pull it via a normal https link.
 *
 * Only product images are exposed (data customers are meant to see anyway).
 */

import { adminGetDoc } from "@/lib/server/firestore-rest";
import type { Product } from "@/lib/types";

export const runtime = "edge";

const DATA_URL_RE = /^data:(?<mime>[^;]+);base64,(?<data>.+)$/s;

export async function GET(
  _req: Request,
  { params }: { params: { productId: string } }
): Promise<Response> {
  const product = await adminGetDoc<Product>("products", params.productId);
  if (!product || product.status !== "active" || !product.imageBase64) {
    return new Response("Not found", { status: 404 });
  }

  const match = DATA_URL_RE.exec(product.imageBase64.trim());
  if (!match?.groups) {
    return new Response("Unsupported image format", { status: 415 });
  }
  const mime = match.groups.mime || "image/jpeg";
  const b64 = match.groups.data;

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400",
      "Content-Length": String(bytes.length),
    },
  });
}
