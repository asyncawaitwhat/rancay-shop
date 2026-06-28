/**
 * The approved ERP tool surface exposed to the model via OpenAI function calling.
 *
 * GPT can ONLY request these tools; it can never write to Firebase directly.
 * Every tool validates its inputs and runs trusted server logic. Prices, stock,
 * totals, invoice numbers, etc. are always returned by the ERP — never invented.
 */

import { getProductDetails as fetchDetails, searchProducts } from "./products";
import {
  addToCart,
  removeFromCart,
  getOrCreateActiveCart,
  calculateCart,
} from "./cart";
import { createOrFindCustomer, type CustomerRef } from "./customers";
import { createInvoiceFromCart } from "./invoice";
import { setSessionStatus } from "./sessions";
import type { WhatsappSettings } from "../../types";

export interface ToolContext {
  phone: string;
  profileName?: string;
  baseUrl: string;
  sessionId: string;
  settings: WhatsappSettings;
  // Side-channel state collected while tools run:
  customer?: CustomerRef;
  outbox: { images: { url: string; caption: string }[] };
  flags: { handoff: boolean; invoiced: boolean; invoiceNumber?: string };
}

/** OpenAI tool/function schemas. Names match the dispatcher below. */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "searchProducts",
      description:
        "Search ACTIVE store products by Arabic name, English name, SKU/code, category, or keyword. Returns price, stock and image availability from the ERP. Always call this before recommending products.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Customer's product keywords (Arabic or English). Leave empty to list available products.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProductDetails",
      description:
        "Get full ERP details for one product by its productId (price, stock, attributes). Call before giving detailed info.",
      parameters: {
        type: "object",
        properties: { productId: { type: "string" } },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProductImage",
      description:
        "Send the product's image to the customer on WhatsApp and return its URL. Use when the customer asks to see a product or when showing a suggestion.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
          caption: {
            type: "string",
            description: "Short caption in the customer's language.",
          },
        },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addToCart",
      description:
        "Add a product to the customer's cart. Only call when the customer clearly chose a product AND a quantity. The ERP validates stock.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
        },
        required: ["productId", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "removeFromCart",
      description: "Remove a product from the cart by productId.",
      parameters: {
        type: "object",
        properties: { productId: { type: "string" } },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCart",
      description:
        "Return the current cart with items and ERP-computed totals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "calculateCart",
      description:
        "Recalculate cart subtotal, tax, delivery and total from the backend. Use before showing totals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvoice",
      description:
        "Create the final ERP invoice and deduct stock. ONLY call after the customer has clearly confirmed the order. The ERP generates the invoice number.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "handoffToHuman",
      description:
        "Hand the conversation to a human team member and stop AI auto-replies. Use when the customer asks for a person or is upset.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
    },
  },
] as const;

async function ensureCustomer(ctx: ToolContext): Promise<CustomerRef> {
  if (ctx.customer) return ctx.customer;
  ctx.customer = await createOrFindCustomer({
    phone: ctx.phone,
    profileName: ctx.profileName,
  });
  return ctx.customer;
}

type Json = Record<string, unknown>;

/**
 * Execute one tool call. Returns a JSON-serialisable object handed back to the
 * model as the tool result. Never throws — failures are returned as { error }.
 */
export async function executeTool(
  name: string,
  args: Json,
  ctx: ToolContext
): Promise<Json> {
  try {
    switch (name) {
      case "searchProducts": {
        const query = typeof args.query === "string" ? args.query : "";
        const results = await searchProducts(query, ctx.baseUrl);
        return {
          count: results.length,
          products: results.map((p) => ({
            productId: p.id,
            sku: p.sku,
            name: ctx.settings.defaultLanguage === "en" ? p.englishName : p.arabicName,
            englishName: p.englishName,
            arabicName: p.arabicName,
            category: p.category,
            price: p.price,
            inStock: p.inStock,
            availableQty: p.availableQty,
            hasImage: p.hasImage,
          })),
        };
      }

      case "getProductDetails": {
        const productId = String(args.productId || "");
        if (!productId) return { error: "productId is required" };
        const d = await fetchDetails(productId, ctx.baseUrl);
        if (!d) return { error: "Product not found or inactive" };
        return {
          productId: d.id,
          sku: d.sku,
          englishName: d.englishName,
          arabicName: d.arabicName,
          category: d.category,
          price: d.price,
          inStock: d.inStock,
          availableQty: d.availableQty,
          description: d.description,
          brand: d.brand,
          color: d.color,
          size: d.size,
          hasImage: d.hasImage,
        };
      }

      case "getProductImage": {
        const productId = String(args.productId || "");
        if (!productId) return { error: "productId is required" };
        const d = await fetchDetails(productId, ctx.baseUrl);
        if (!d) return { error: "Product not found or inactive" };
        if (!d.imageUrl) return { hasImage: false, message: "No image available" };
        const caption =
          typeof args.caption === "string" && args.caption
            ? args.caption
            : `${d.arabicName} — ${d.price}`;
        ctx.outbox.images.push({ url: d.imageUrl, caption });
        return { hasImage: true, imageUrl: d.imageUrl, willSend: true };
      }

      case "addToCart": {
        const productId = String(args.productId || "");
        const quantity = Number(args.quantity);
        if (!productId) return { error: "productId is required" };
        const res = await addToCart(ctx.phone, productId, quantity, ctx.settings);
        if (!res.ok) return { error: res.error };
        return { ok: true, cart: cartView(res.cart!) };
      }

      case "removeFromCart": {
        const productId = String(args.productId || "");
        if (!productId) return { error: "productId is required" };
        const res = await removeFromCart(ctx.phone, productId, ctx.settings);
        if (!res.ok) return { error: res.error };
        return { ok: true, cart: cartView(res.cart!) };
      }

      case "getCart": {
        const cart = await getOrCreateActiveCart(ctx.phone);
        return { cart: cartView(cart) };
      }

      case "calculateCart": {
        const cart = await calculateCart(ctx.phone, ctx.settings);
        return { cart: cartView(cart) };
      }

      case "createInvoice": {
        const cart = await getOrCreateActiveCart(ctx.phone);
        if (!cart.items.length) return { error: "Cart is empty — nothing to invoice." };
        const customer = await ensureCustomer(ctx);
        const res = await createInvoiceFromCart({
          cartId: cart.id,
          customer,
          phone: ctx.phone,
          sessionId: ctx.sessionId,
          settings: ctx.settings,
        });
        if (!res.ok) return { error: res.error };
        ctx.flags.invoiced = true;
        ctx.flags.invoiceNumber = res.invoiceNumber;
        return {
          ok: true,
          invoiceNumber: res.invoiceNumber,
          grandTotal: res.grandTotal,
          itemCount: res.itemCount,
        };
      }

      case "handoffToHuman": {
        await setSessionStatus(ctx.phone, "human_handoff");
        ctx.flags.handoff = true;
        return { ok: true, message: "Conversation handed to a human agent." };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function cartView(cart: {
  items: {
    productId: string;
    productEnglishName: string;
    productArabicName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  total: number;
}) {
  return {
    items: cart.items.map((i) => ({
      productId: i.productId,
      englishName: i.productEnglishName,
      arabicName: i.productArabicName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
    subtotal: cart.subtotal,
    discount: cart.discount,
    tax: cart.tax,
    deliveryFee: cart.deliveryFee,
    total: cart.total,
  };
}
