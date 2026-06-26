"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Field } from "@/components/shared/field";
import { useLang } from "@/components/providers/language-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { useBrand } from "@/hooks/use-brand";
import { reportLoaders, inRange } from "@/lib/firebase/services/reports";
import { printReport } from "@/lib/pdf";
import { formatDate, formatMoney, arrayToCsv, downloadCsv, toISODateInput } from "@/lib/utils";
import type {
  SalesInvoice, ReturnInvoice, ExpenseSlip, Product, Client, FinanceTransaction,
} from "@/lib/types";

type ReportKey =
  | "sales" | "returns" | "netRevenue" | "expenses" | "profit"
  | "productMovement" | "lowStock" | "vaultTransactions" | "topClients"
  | "topProducts" | "daily" | "monthly";

interface BuiltReport {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  summary: { label: string; value: string }[];
}

export default function ReportsPage() {
  return (
    <ScreenGuard screen="reports">
      <ReportsContent />
    </ScreenGuard>
  );
}

function ReportsContent() {
  const { t, lang, name } = useLang();
  const { can } = usePermissions();
  const brand = useBrand();
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ReportKey>("sales");
  const [from, setFrom] = useState(toISODateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(toISODateInput(new Date()));

  const [data, setData] = useState<{
    sales: SalesInvoice[]; returns: ReturnInvoice[]; expenses: ExpenseSlip[];
    products: Product[]; clients: Client[]; transactions: FinanceTransaction[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      reportLoaders.sales(), reportLoaders.returns(), reportLoaders.expenses(),
      reportLoaders.products(), reportLoaders.clients(), reportLoaders.transactions(),
    ])
      .then(([sales, returns, expenses, products, clients, transactions]) =>
        setData({ sales, returns, expenses, products, clients, transactions }))
      .finally(() => setLoading(false));
  }, []);

  const reportTypes: { key: ReportKey; label: string }[] = [
    { key: "sales", label: t("report.sales") },
    { key: "returns", label: t("report.returns") },
    { key: "netRevenue", label: t("report.netRevenue") },
    { key: "expenses", label: t("report.expenses") },
    { key: "profit", label: t("report.profit") },
    { key: "productMovement", label: t("report.productMovement") },
    { key: "lowStock", label: t("report.lowStock") },
    { key: "vaultTransactions", label: t("report.vaultTransactions") },
    { key: "topClients", label: t("report.topClients") },
    { key: "topProducts", label: t("report.topProducts") },
    { key: "daily", label: t("report.daily") },
    { key: "monthly", label: t("report.monthly") },
  ];

  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  const report: BuiltReport | null = useMemo(() => {
    if (!data) return null;
    return buildReport(type, data, fromDate, toDate, { t, name, lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, type, from, to, lang]);

  function exportPdf() {
    if (!report) return;
    printReport({ title: report.title, summary: report.summary, columns: report.columns, rows: report.rows, brand, lang });
  }
  function exportCsv() {
    if (!report) return;
    downloadCsv(`${type}-report.csv`, arrayToCsv([report.columns, ...report.rows]));
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.reports")} />

      <Card><CardContent className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("report.selectReport")}>
            <Select value={type} onValueChange={(v) => setType(v as ReportKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{reportTypes.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={t("common.from")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" /></Field>
          <Field label={t("common.to")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" /></Field>
          <div className="flex items-end gap-2">
            {can("reports", "export") && <Button variant="outline" onClick={exportPdf}><FileText className="h-4 w-4" /> PDF</Button>}
            {can("reports", "export") && <Button variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4" /> CSV</Button>}
          </div>
        </div>
      </CardContent></Card>

      {report && (
        <>
          {report.summary.length > 0 && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {report.summary.map((s) => (
                <Card key={s.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="mt-1 text-lg font-bold">{s.value}</p></CardContent></Card>
              ))}
            </div>
          )}
          <Card><CardContent className="p-4">
            {report.rows.length === 0 ? <EmptyState /> : (
              <Table>
                <TableHeader><TableRow>{report.columns.map((c, i) => <TableHead key={i} className={i === 0 ? "" : "text-end"}>{c}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{report.rows.map((row, ri) => (
                  <TableRow key={ri}>{row.map((cell, ci) => <TableCell key={ci} className={ci === 0 ? "font-medium" : "text-end"}>{cell}</TableCell>)}</TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

function buildReport(
  type: ReportKey,
  d: { sales: SalesInvoice[]; returns: ReturnInvoice[]; expenses: ExpenseSlip[]; products: Product[]; clients: Client[]; transactions: FinanceTransaction[] },
  from: Date | undefined,
  to: Date | undefined,
  ctx: { t: (k: string) => string; name: (en?: string, ar?: string) => string; lang: string }
): BuiltReport {
  const { t, name } = ctx;
  const postedSales = d.sales.filter((i) => i.status === "posted" && inRange(i.invoiceDate, from, to));
  const postedReturns = d.returns.filter((r) => r.status === "posted" && inRange(r.invoiceDate, from, to));
  const expenses = d.expenses.filter((e) => inRange(e.date, from, to));
  const money = (n: number) => formatMoney(n);

  switch (type) {
    case "sales": {
      const rows = postedSales.map((i) => [i.invoiceNumber, formatDate(i.invoiceDate), name(i.clientEnglishName, i.clientArabicName), money(i.grandTotal), money(i.paidAmount), money(i.remainingAmount)]);
      const totalT = postedSales.reduce((s, i) => s + i.grandTotal, 0);
      const paidT = postedSales.reduce((s, i) => s + i.paidAmount, 0);
      return {
        title: t("report.sales"),
        columns: [t("invoice.number"), t("common.date"), t("common.client"), t("invoice.grandTotal"), t("invoice.paidAmount"), t("invoice.remaining")],
        rows,
        summary: [
          { label: t("report.count"), value: String(postedSales.length) },
          { label: t("dash.totalSales"), value: money(totalT) },
          { label: t("client.totalPaid"), value: money(paidT) },
          { label: t("invoice.remaining"), value: money(totalT - paidT) },
        ],
      };
    }
    case "returns": {
      const rows = postedReturns.map((r) => [r.invoiceNumber, formatDate(r.invoiceDate), name(r.clientEnglishName, r.clientArabicName), money(r.grandTotal)]);
      const totalT = postedReturns.reduce((s, r) => s + r.grandTotal, 0);
      return {
        title: t("report.returns"),
        columns: [t("return.number"), t("common.date"), t("common.client"), t("invoice.grandTotal")],
        rows,
        summary: [{ label: t("report.count"), value: String(postedReturns.length) }, { label: t("dash.totalReturns"), value: money(totalT) }],
      };
    }
    case "netRevenue": {
      const sales = postedSales.reduce((s, i) => s + i.grandTotal, 0);
      const rets = postedReturns.reduce((s, r) => s + r.grandTotal, 0);
      return {
        title: t("report.netRevenue"),
        columns: [t("common.type"), t("common.amount")],
        rows: [[t("dash.totalSales"), money(sales)], [t("dash.totalReturns"), money(rets)], [t("dash.netRevenue"), money(sales - rets)]],
        summary: [{ label: t("dash.netRevenue"), value: money(sales - rets) }],
      };
    }
    case "expenses": {
      const rows = expenses.map((e) => [e.expenseNumber, formatDate(e.date), e.category, name(e.vaultEnglishName, e.vaultArabicName), money(e.amount)]);
      const totalT = expenses.reduce((s, e) => s + e.amount, 0);
      return {
        title: t("report.expenses"),
        columns: [t("expense.number"), t("common.date"), t("expense.category"), t("common.vault"), t("common.amount")],
        rows,
        summary: [{ label: t("report.count"), value: String(expenses.length) }, { label: t("dash.totalExpenses"), value: money(totalT) }],
      };
    }
    case "profit": {
      const sales = postedSales.reduce((s, i) => s + i.grandTotal, 0);
      const rets = postedReturns.reduce((s, r) => s + r.grandTotal, 0);
      const exp = expenses.reduce((s, e) => s + e.amount, 0);
      const costMap = new Map(d.products.map((p) => [p.id, p.costPrice || 0]));
      let cogs = 0;
      postedSales.forEach((i) => i.lines.forEach((l) => { cogs += (costMap.get(l.productId) || 0) * l.quantity; }));
      const profit = sales - rets - cogs - exp;
      return {
        title: t("report.profit"),
        columns: [t("common.type"), t("common.amount")],
        rows: [[t("dash.totalSales"), money(sales)], [t("dash.totalReturns"), money(rets)], ["COGS", money(cogs)], [t("dash.totalExpenses"), money(exp)], [t("dash.netProfit"), money(profit)]],
        summary: [{ label: t("dash.netProfit"), value: money(profit) }],
      };
    }
    case "productMovement": {
      const agg = new Map<string, { name: string; nameAr: string; sku: string; qty: number; revenue: number }>();
      postedSales.forEach((i) => i.lines.forEach((l) => {
        const c = agg.get(l.productId) || { name: l.productEnglishName, nameAr: l.productArabicName, sku: l.productSku, qty: 0, revenue: 0 };
        c.qty += l.quantity; c.revenue += l.lineTotal; agg.set(l.productId, c);
      }));
      const rows = [...agg.values()].sort((a, b) => b.qty - a.qty).map((p) => [name(p.name, p.nameAr), p.sku, p.qty, money(p.revenue)]);
      return {
        title: t("report.productMovement"),
        columns: [t("common.product"), t("product.sku"), t("common.quantity"), t("dash.totalSales")],
        rows,
        summary: [{ label: t("report.count"), value: String(agg.size) }],
      };
    }
    case "lowStock": {
      const low = d.products.filter((p) => p.currentQty <= p.minimumQty);
      const rows = low.map((p) => [name(p.englishName, p.arabicName), p.sku, p.currentQty, p.minimumQty]);
      return {
        title: t("report.lowStock"),
        columns: [t("common.product"), t("product.sku"), t("product.currentQty"), t("product.minimumQty")],
        rows,
        summary: [{ label: t("report.count"), value: String(low.length) }],
      };
    }
    case "vaultTransactions": {
      const txns = d.transactions.filter((tx) => inRange(tx.date, from, to));
      const rows = txns.map((tx) => [tx.transactionNumber, formatDate(tx.date), name(tx.vaultEnglishName, tx.vaultArabicName), tx.type, money(tx.amount)]);
      const income = txns.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
      const out = txns.filter((x) => x.amount < 0).reduce((s, x) => s + Math.abs(x.amount), 0);
      return {
        title: t("report.vaultTransactions"),
        columns: [t("trx.number"), t("common.date"), t("common.vault"), t("common.type"), t("common.amount")],
        rows,
        summary: [{ label: t("trx.income"), value: money(income) }, { label: t("trx.expense"), value: money(out) }, { label: t("dash.netRevenue"), value: money(income - out) }],
      };
    }
    case "topClients": {
      const rows = [...d.clients].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0)).slice(0, 20)
        .map((c) => [name(c.englishName, c.arabicName), money(c.totalSales || 0), money(c.totalReturns || 0), money(c.balance || 0)]);
      return {
        title: t("report.topClients"),
        columns: [t("common.client"), t("client.totalSales"), t("client.totalReturns"), t("client.balance")],
        rows,
        summary: [],
      };
    }
    case "topProducts": {
      const agg = new Map<string, { name: string; nameAr: string; qty: number; revenue: number }>();
      postedSales.forEach((i) => i.lines.forEach((l) => {
        const c = agg.get(l.productId) || { name: l.productEnglishName, nameAr: l.productArabicName, qty: 0, revenue: 0 };
        c.qty += l.quantity; c.revenue += l.lineTotal; agg.set(l.productId, c);
      }));
      const rows = [...agg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20).map((p) => [name(p.name, p.nameAr), p.qty, money(p.revenue)]);
      return {
        title: t("report.topProducts"),
        columns: [t("common.product"), t("common.quantity"), t("dash.totalSales")],
        rows,
        summary: [],
      };
    }
    case "daily": {
      const byDay = new Map<string, number>();
      postedSales.forEach((i) => { const k = formatDate(i.invoiceDate); byDay.set(k, (byDay.get(k) || 0) + i.grandTotal); });
      const rows = [...byDay.entries()].map(([day, v]) => [day, money(v)]);
      return {
        title: t("report.daily"),
        columns: [t("common.date"), t("dash.totalSales")],
        rows,
        summary: [{ label: t("dash.totalSales"), value: money(postedSales.reduce((s, i) => s + i.grandTotal, 0)) }],
      };
    }
    case "monthly": {
      const byMonth = new Map<string, number>();
      postedSales.forEach((i) => {
        const dt = new Date(formatDate(i.invoiceDate));
        const k = isNaN(dt.getTime()) ? "—" : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(k, (byMonth.get(k) || 0) + i.grandTotal);
      });
      const rows = [...byMonth.entries()].sort().map(([m, v]) => [m, money(v)]);
      return {
        title: t("report.monthly"),
        columns: [t("common.date"), t("dash.totalSales")],
        rows,
        summary: [{ label: t("dash.totalSales"), value: money(postedSales.reduce((s, i) => s + i.grandTotal, 0)) }],
      };
    }
  }
}
