import type {
  BrandSettings,
  SalesInvoice,
  ReturnInvoice,
  ReceiptSlip,
  ExpenseSlip,
  Client,
  InvoiceLine,
} from "./types";
import { formatDate, formatMoney } from "./utils";
import type { Lang } from "./i18n/dictionary";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}

function brandName(brand: BrandSettings | null, lang: Lang): string {
  if (!brand) return "Clothes Store";
  return lang === "ar"
    ? brand.companyArabicName || brand.companyEnglishName
    : brand.companyEnglishName || brand.companyArabicName;
}

function currency(brand: BrandSettings | null, lang: Lang): string {
  if (!brand) return lang === "ar" ? "ج.م" : "EGP";
  return (lang === "ar" ? brand.currencyArabic : brand.currencyEnglish) || (lang === "ar" ? "ج.م" : "EGP");
}

/** Wrap a document body in a branded, print-ready HTML shell and trigger print. */
export function printDocument(opts: {
  title: string;
  body: string;
  brand: BrandSettings | null;
  lang: Lang;
}) {
  const { title, body, brand, lang } = opts;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const contact: string[] = [];
  if (brand?.phone) contact.push(esc(brand.phone));
  if (brand?.email) contact.push(esc(brand.email));
  if (brand?.website) contact.push(esc(brand.website));
  const address = lang === "ar" ? brand?.addressArabic : brand?.addressEnglish;

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ${lang === "ar" ? "'Segoe UI', Tahoma, sans-serif" : "Arial, Helvetica, sans-serif"}; color:#111; margin:0; padding:32px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #111; padding-bottom:16px; margin-bottom:24px; }
  .company h1 { margin:0 0 4px; font-size:22px; }
  .company p { margin:2px 0; font-size:12px; color:#555; }
  .logo img { max-height:80px; max-width:160px; object-fit:contain; }
  .doc-title { text-align:${dir === "rtl" ? "left" : "right"}; }
  .doc-title h2 { margin:0; font-size:20px; text-transform:uppercase; }
  .doc-title p { margin:4px 0; font-size:13px; }
  .meta { display:flex; justify-content:space-between; gap:24px; margin-bottom:20px; font-size:13px; }
  .meta .box { background:#f7f7f7; padding:12px 16px; border-radius:8px; flex:1; }
  .meta .box strong { display:block; margin-bottom:4px; color:#333; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; font-size:13px; }
  th, td { border:1px solid #ddd; padding:8px 10px; text-align:${dir === "rtl" ? "right" : "left"}; }
  th { background:#111; color:#fff; font-weight:600; }
  tbody tr:nth-child(even) { background:#fafafa; }
  .num { text-align:${dir === "rtl" ? "left" : "right"}; font-variant-numeric: tabular-nums; }
  .totals { width:300px; margin-${dir === "rtl" ? "right" : "left"}:auto; font-size:13px; }
  .totals td { border:none; padding:4px 8px; }
  .totals .grand { font-size:16px; font-weight:bold; border-top:2px solid #111; }
  .notes { margin-top:16px; font-size:12px; color:#555; }
  .footer { margin-top:40px; border-top:1px solid #ddd; padding-top:12px; font-size:11px; color:#777; text-align:center; }
  @media print { body { padding:16px; } }
</style>
</head>
<body>
  <div class="head">
    <div class="company">
      <h1>${esc(brandName(brand, lang))}</h1>
      ${address ? `<p>${esc(address)}</p>` : ""}
      ${contact.length ? `<p>${contact.join(" • ")}</p>` : ""}
      ${brand?.taxNumber ? `<p>Tax: ${esc(brand.taxNumber)}</p>` : ""}
    </div>
    <div class="logo">${brand?.logoBase64 ? `<img src="${brand.logoBase64}" alt="logo" />` : ""}</div>
  </div>
  ${body}
  <div class="footer">${esc((lang === "ar" ? brand?.invoiceFooterArabic : brand?.invoiceFooterEnglish) || "")}</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert("Please allow pop-ups to export/print documents.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function linesTable(
  lines: InvoiceLine[],
  lang: Lang,
  cur: string,
  labels: { item: string; qty: string; price: string; disc: string; total: string }
): string {
  const rows = lines
    .map((l, i) => {
      const nm = lang === "ar" ? l.productArabicName : l.productEnglishName;
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(nm)}<br/><span style="color:#888;font-size:11px">${esc(l.productSku)}</span></td>
        <td class="num">${l.quantity}</td>
        <td class="num">${formatMoney(l.price)}</td>
        <td class="num">${formatMoney(l.lineDiscount)}</td>
        <td class="num">${formatMoney(l.lineTotal)} ${cur}</td>
      </tr>`;
    })
    .join("");
  return `<table>
    <thead><tr><th>#</th><th>${labels.item}</th><th>${labels.qty}</th><th>${labels.price}</th><th>${labels.disc}</th><th>${labels.total}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const L = {
  en: {
    invoice: "Sales Invoice", ret: "Return Invoice", receipt: "Receipt Voucher", expense: "Expense Voucher",
    statement: "Client Statement", no: "No.", date: "Date", client: "Client", item: "Item", qty: "Qty",
    price: "Price", disc: "Discount", total: "Total", subtotal: "Subtotal", grand: "Grand Total",
    paid: "Paid", remaining: "Remaining", notes: "Notes", by: "Issued by", vault: "Vault", method: "Method",
    paidTo: "Paid To", category: "Category", amount: "Amount", balance: "Balance",
  },
  ar: {
    invoice: "فاتورة مبيعات", ret: "فاتورة مرتجع", receipt: "سند قبض", expense: "سند صرف",
    statement: "كشف حساب عميل", no: "رقم", date: "التاريخ", client: "العميل", item: "الصنف", qty: "الكمية",
    price: "السعر", disc: "الخصم", total: "الإجمالي", subtotal: "المجموع الفرعي", grand: "الإجمالي النهائي",
    paid: "المدفوع", remaining: "المتبقي", notes: "ملاحظات", by: "حرر بواسطة", vault: "الخزنة", method: "طريقة الدفع",
    paidTo: "مدفوع إلى", category: "الفئة", amount: "المبلغ", balance: "الرصيد",
  },
};

export function printInvoice(inv: SalesInvoice, brand: BrandSettings | null, lang: Lang) {
  const x = L[lang];
  const cur = currency(brand, lang);
  const client = lang === "ar" ? inv.clientArabicName : inv.clientEnglishName;
  const body = `
    <div class="meta">
      <div class="box"><strong>${x.invoice} ${esc(inv.invoiceNumber)}</strong>${x.date}: ${formatDate(inv.invoiceDate)}<br/>${x.by}: ${esc(inv.createdByName || "")}</div>
      <div class="box"><strong>${x.client}</strong>${esc(client)}</div>
    </div>
    ${linesTable(inv.lines, lang, cur, x)}
    <table class="totals">
      <tr><td>${x.subtotal}</td><td class="num">${formatMoney(inv.subtotal)} ${cur}</td></tr>
      <tr><td>${x.disc}</td><td class="num">${formatMoney(inv.totalDiscount)} ${cur}</td></tr>
      <tr class="grand"><td>${x.grand}</td><td class="num">${formatMoney(inv.grandTotal)} ${cur}</td></tr>
      <tr><td>${x.paid}</td><td class="num">${formatMoney(inv.paidAmount)} ${cur}</td></tr>
      <tr><td>${x.remaining}</td><td class="num">${formatMoney(inv.remainingAmount)} ${cur}</td></tr>
    </table>
    ${inv.notes ? `<div class="notes"><strong>${x.notes}:</strong> ${esc(inv.notes)}</div>` : ""}`;
  printDocument({ title: `${x.invoice} ${inv.invoiceNumber}`, body, brand, lang });
}

export function printReturn(inv: ReturnInvoice, brand: BrandSettings | null, lang: Lang) {
  const x = L[lang];
  const cur = currency(brand, lang);
  const client = lang === "ar" ? inv.clientArabicName : inv.clientEnglishName;
  const body = `
    <div class="meta">
      <div class="box"><strong>${x.ret} ${esc(inv.invoiceNumber)}</strong>${x.date}: ${formatDate(inv.invoiceDate)}<br/>${x.by}: ${esc(inv.createdByName || "")}</div>
      <div class="box"><strong>${x.client}</strong>${esc(client)}${inv.originalInvoiceNumber ? `<br/>Ref: ${esc(inv.originalInvoiceNumber)}` : ""}</div>
    </div>
    ${linesTable(inv.lines, lang, cur, x)}
    <table class="totals">
      <tr><td>${x.subtotal}</td><td class="num">${formatMoney(inv.subtotal)} ${cur}</td></tr>
      <tr><td>${x.disc}</td><td class="num">${formatMoney(inv.totalDiscount)} ${cur}</td></tr>
      <tr class="grand"><td>${x.grand}</td><td class="num">${formatMoney(inv.grandTotal)} ${cur}</td></tr>
    </table>
    ${inv.notes ? `<div class="notes"><strong>${x.notes}:</strong> ${esc(inv.notes)}</div>` : ""}`;
  printDocument({ title: `${x.ret} ${inv.invoiceNumber}`, body, brand, lang });
}

export function printReceipt(r: ReceiptSlip, brand: BrandSettings | null, lang: Lang) {
  const x = L[lang];
  const cur = currency(brand, lang);
  const client = lang === "ar" ? r.clientArabicName : r.clientEnglishName;
  const vault = lang === "ar" ? r.vaultArabicName : r.vaultEnglishName;
  const body = `
    <div class="meta">
      <div class="box"><strong>${x.receipt} ${esc(r.receiptNumber)}</strong>${x.date}: ${formatDate(r.date)}<br/>${x.by}: ${esc(r.createdByName || "")}</div>
      <div class="box"><strong>${x.client}</strong>${esc(client)}</div>
    </div>
    <table>
      <tr><th>${x.amount}</th><th>${x.vault}</th><th>${x.method}</th></tr>
      <tr><td class="num">${formatMoney(r.amount)} ${cur}</td><td>${esc(vault)}</td><td>${esc(r.paymentMethod)}</td></tr>
    </table>
    ${r.notes ? `<div class="notes"><strong>${x.notes}:</strong> ${esc(r.notes)}</div>` : ""}`;
  printDocument({ title: `${x.receipt} ${r.receiptNumber}`, body, brand, lang });
}

export function printExpense(e: ExpenseSlip, brand: BrandSettings | null, lang: Lang) {
  const x = L[lang];
  const cur = currency(brand, lang);
  const vault = lang === "ar" ? e.vaultArabicName : e.vaultEnglishName;
  const body = `
    <div class="meta">
      <div class="box"><strong>${x.expense} ${esc(e.expenseNumber)}</strong>${x.date}: ${formatDate(e.date)}<br/>${x.by}: ${esc(e.createdByName || "")}</div>
      <div class="box"><strong>${x.category}</strong>${esc(e.category)}</div>
    </div>
    <table>
      <tr><th>${x.amount}</th><th>${x.vault}</th><th>${x.paidTo}</th></tr>
      <tr><td class="num">${formatMoney(e.amount)} ${cur}</td><td>${esc(vault)}</td><td>${esc(e.paidTo || "-")}</td></tr>
    </table>
    ${e.notes ? `<div class="notes"><strong>${x.notes}:</strong> ${esc(e.notes)}</div>` : ""}`;
  printDocument({ title: `${x.expense} ${e.expenseNumber}`, body, brand, lang });
}

export function printClientStatement(
  client: Client,
  rows: { date: unknown; doc: string; type: string; debit: number; credit: number }[],
  brand: BrandSettings | null,
  lang: Lang
) {
  const x = L[lang];
  const cur = currency(brand, lang);
  const name = lang === "ar" ? client.arabicName : client.englishName;
  let running = 0;
  const trs = rows
    .map((r) => {
      running += r.debit - r.credit;
      return `<tr>
        <td>${formatDate(r.date as never)}</td>
        <td>${esc(r.doc)}</td>
        <td>${esc(r.type)}</td>
        <td class="num">${r.debit ? formatMoney(r.debit) : "-"}</td>
        <td class="num">${r.credit ? formatMoney(r.credit) : "-"}</td>
        <td class="num">${formatMoney(running)}</td>
      </tr>`;
    })
    .join("");
  const body = `
    <div class="meta">
      <div class="box"><strong>${x.statement}</strong>${x.client}: ${esc(name)} (${esc(client.clientCode)})<br/>${x.date}: ${formatDate(new Date())}</div>
      <div class="box"><strong>${x.balance}</strong>${formatMoney(client.balance)} ${cur}</div>
    </div>
    <table>
      <thead><tr><th>${x.date}</th><th>${x.no}</th><th>${x.item}</th><th>${x.total} (+)</th><th>${x.paid} (-)</th><th>${x.balance}</th></tr></thead>
      <tbody>${trs || `<tr><td colspan="6" style="text-align:center">—</td></tr>`}</tbody>
    </table>`;
  printDocument({ title: `${x.statement} ${client.clientCode}`, body, brand, lang });
}

/** Generic report printer: title + summary cards + a table. */
export function printReport(opts: {
  title: string;
  summary: { label: string; value: string }[];
  columns: string[];
  rows: (string | number)[][];
  brand: BrandSettings | null;
  lang: Lang;
}) {
  const { title, summary, columns, rows, brand, lang } = opts;
  const cards = summary
    .map((s) => `<div class="box"><strong>${esc(s.label)}</strong>${esc(s.value)}</div>`)
    .join("");
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join("");
  const trs = rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? "" : "num"}">${esc(c)}</td>`).join("")}</tr>`)
    .join("");
  const body = `
    <h2 style="margin-bottom:16px">${esc(title)}</h2>
    ${summary.length ? `<div class="meta">${cards}</div>` : ""}
    <table><thead><tr>${head}</tr></thead><tbody>${trs || `<tr><td colspan="${columns.length}" style="text-align:center">—</td></tr>`}</tbody></table>`;
  printDocument({ title, body, brand, lang });
}
