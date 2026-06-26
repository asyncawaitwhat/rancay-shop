import { listDocs, orderBy, limit } from "../firestore";
import type {
  SalesInvoice,
  ReturnInvoice,
  ExpenseSlip,
  ReceiptSlip,
  Product,
  Client,
  Vault,
  FinanceTransaction,
} from "../../types";
import { toDate } from "../../utils";

function inRange(d: unknown, from?: Date, to?: Date): boolean {
  const date = toDate(d as never);
  if (!date) return false;
  if (from && date < from) return false;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (date > end) return false;
  }
  return true;
}

export interface DashboardStats {
  totalSales: number;
  totalReturns: number;
  netRevenue: number;
  totalExpenses: number;
  totalReceipts: number;
  netProfit: number;
  clientCount: number;
  productCount: number;
  lowStockCount: number;
  todaySales: number;
  monthSales: number;
  vaultTotal: number;
  recentInvoices: SalesInvoice[];
  recentReceipts: ReceiptSlip[];
  lowStockProducts: Product[];
  topProducts: { name: string; nameAr: string; qty: number; revenue: number }[];
  topClients: { name: string; nameAr: string; revenue: number }[];
  salesByDay: { label: string; sales: number; returns: number }[];
  salesByMonth: { label: string; sales: number; expenses: number }[];
  expensesByCategory: { label: string; value: number }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [invoices, returns, expenses, receipts, products, clients, vaults] =
    await Promise.all([
      listDocs<SalesInvoice>("salesInvoices"),
      listDocs<ReturnInvoice>("returnInvoices"),
      listDocs<ExpenseSlip>("expenseSlips"),
      listDocs<ReceiptSlip>("receiptSlips"),
      listDocs<Product>("products"),
      listDocs<Client>("clients"),
      listDocs<Vault>("vaults"),
    ]);

  const posted = invoices.filter((i) => i.status === "posted");
  const postedReturns = returns.filter((r) => r.status === "posted");

  const totalSales = posted.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const totalReturns = postedReturns.reduce((s, r) => s + (r.grandTotal || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalReceipts = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  const netRevenue = totalSales - totalReturns;

  // Estimated COGS from posted invoice lines using product cost prices.
  const costMap = new Map(products.map((p) => [p.id, p.costPrice || 0]));
  let cogs = 0;
  posted.forEach((i) =>
    i.lines.forEach((l) => {
      cogs += (costMap.get(l.productId) || 0) * l.quantity;
    })
  );
  const netProfit = netRevenue - cogs - totalExpenses;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const todaySales = posted
    .filter((i) => inRange(i.invoiceDate, todayStart))
    .reduce((s, i) => s + (i.grandTotal || 0), 0);
  const monthSales = posted
    .filter((i) => inRange(i.invoiceDate, monthStart))
    .reduce((s, i) => s + (i.grandTotal || 0), 0);

  // Top products by quantity sold.
  const prodAgg = new Map<string, { name: string; nameAr: string; qty: number; revenue: number }>();
  posted.forEach((i) =>
    i.lines.forEach((l) => {
      const cur = prodAgg.get(l.productId) || {
        name: l.productEnglishName,
        nameAr: l.productArabicName,
        qty: 0,
        revenue: 0,
      };
      cur.qty += l.quantity;
      cur.revenue += l.lineTotal;
      prodAgg.set(l.productId, cur);
    })
  );
  const topProducts = [...prodAgg.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Top clients by revenue.
  const topClients = [...clients]
    .map((c) => ({ name: c.englishName, nameAr: c.arabicName, revenue: c.totalSales || 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Last 14 days sales/returns.
  const salesByDay: { label: string; sales: number; returns: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const label = `${day.getDate()}/${day.getMonth() + 1}`;
    const sales = posted
      .filter((i) => inRange(i.invoiceDate, day, day))
      .reduce((s, i) => s + (i.grandTotal || 0), 0);
    const rets = postedReturns
      .filter((r) => inRange(r.invoiceDate, day, day))
      .reduce((s, r) => s + (r.grandTotal || 0), 0);
    salesByDay.push({ label, sales, returns: rets });
  }

  // Last 6 months sales/expenses.
  const salesByMonth: { label: string; sales: number; expenses: number }[] = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let m = 5; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 0);
    const label = `${monthNames[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`;
    const sales = posted
      .filter((i) => inRange(i.invoiceDate, start, end))
      .reduce((s, i) => s + (i.grandTotal || 0), 0);
    const exp = expenses
      .filter((e) => inRange(e.date, start, end))
      .reduce((s, e) => s + (e.amount || 0), 0);
    salesByMonth.push({ label, sales, expenses: exp });
  }

  const expAgg = new Map<string, number>();
  expenses.forEach((e) => expAgg.set(e.category, (expAgg.get(e.category) || 0) + e.amount));
  const expensesByCategory = [...expAgg.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const lowStockProducts = products.filter((p) => p.currentQty <= p.minimumQty);
  const vaultTotal = vaults.reduce((s, v) => s + (v.currentBalance || 0), 0);

  const recentInvoices = [...invoices]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, 5);
  const recentReceipts = [...receipts]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, 5);

  return {
    totalSales,
    totalReturns,
    netRevenue,
    totalExpenses,
    totalReceipts,
    netProfit,
    clientCount: clients.length,
    productCount: products.length,
    lowStockCount: lowStockProducts.length,
    todaySales,
    monthSales,
    vaultTotal,
    recentInvoices,
    recentReceipts,
    lowStockProducts: lowStockProducts.slice(0, 8),
    topProducts,
    topClients,
    salesByDay,
    salesByMonth,
    expensesByCategory,
  };
}

// --------------------------------------------------------------------------
// Generic data loaders for the reports screen (filtered in the page).
// --------------------------------------------------------------------------
export const reportLoaders = {
  sales: () => listDocs<SalesInvoice>("salesInvoices"),
  returns: () => listDocs<ReturnInvoice>("returnInvoices"),
  expenses: () => listDocs<ExpenseSlip>("expenseSlips"),
  receipts: () => listDocs<ReceiptSlip>("receiptSlips"),
  products: () => listDocs<Product>("products"),
  clients: () => listDocs<Client>("clients"),
  vaults: () => listDocs<Vault>("vaults"),
  transactions: () => listDocs<FinanceTransaction>("financeTransactions"),
  recentMovements: () =>
    listDocs("stockMovements", orderBy("createdAt", "desc"), limit(500)),
};

export { inRange };
