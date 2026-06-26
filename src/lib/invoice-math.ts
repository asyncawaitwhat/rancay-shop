import { money, resolveDiscount } from "./utils";
import type { DiscountType, InvoiceLine } from "./types";

export interface RawLine {
  productId: string;
  productSku: string;
  productEnglishName: string;
  productArabicName: string;
  quantity: number;
  price: number;
  discountType: DiscountType;
  discountValue: number;
}

export function computeLine(line: RawLine): InvoiceLine {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.price) || 0;
  const lineSubtotal = money(qty * price);
  const lineDiscount = resolveDiscount(lineSubtotal, line.discountType, Number(line.discountValue) || 0);
  const lineTotal = money(lineSubtotal - lineDiscount);
  return {
    ...line,
    quantity: qty,
    price,
    discountValue: Number(line.discountValue) || 0,
    lineSubtotal,
    lineDiscount,
    lineTotal,
  };
}

export interface InvoiceTotals {
  lines: InvoiceLine[];
  subtotal: number;
  itemDiscountTotal: number;
  invoiceDiscountTotal: number;
  totalDiscount: number;
  grandTotal: number;
}

export function computeTotals(
  rawLines: RawLine[],
  invoiceDiscountType: DiscountType,
  invoiceDiscountValue: number
): InvoiceTotals {
  const lines = rawLines.map(computeLine);
  const subtotal = money(lines.reduce((s, l) => s + l.lineSubtotal, 0));
  const itemDiscountTotal = money(lines.reduce((s, l) => s + l.lineDiscount, 0));
  const afterItems = money(subtotal - itemDiscountTotal);
  const invoiceDiscountTotal = resolveDiscount(
    afterItems,
    invoiceDiscountType,
    Number(invoiceDiscountValue) || 0
  );
  const totalDiscount = money(itemDiscountTotal + invoiceDiscountTotal);
  const grandTotal = money(afterItems - invoiceDiscountTotal);
  return { lines, subtotal, itemDiscountTotal, invoiceDiscountTotal, totalDiscount, grandTotal };
}

export function paymentStatusOf(grandTotal: number, paid: number) {
  if (paid <= 0) return "unpaid" as const;
  if (paid >= grandTotal) return "paid" as const;
  return "partial" as const;
}
