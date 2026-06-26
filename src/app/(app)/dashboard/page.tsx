"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Users, Shirt,
  AlertTriangle, ShoppingCart, ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Money } from "@/components/shared/money";
import { useLang } from "@/components/providers/language-provider";
import { getDashboardStats, type DashboardStats } from "@/lib/firebase/services/reports";
import { formatMoney, formatDate } from "@/lib/utils";

const PIE_COLORS = ["#0f172a", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function DashboardPage() {
  return (
    <ScreenGuard screen="dashboard">
      <DashboardContent />
    </ScreenGuard>
  );
}

function DashboardContent() {
  const { t, lang, name } = useLang();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error || !stats) return <ErrorState />;

  const cards = [
    { label: t("dash.totalSales"), value: stats.totalSales, icon: TrendingUp, color: "text-blue-600", money: true },
    { label: t("dash.totalReturns"), value: stats.totalReturns, icon: TrendingDown, color: "text-amber-600", money: true },
    { label: t("dash.netRevenue"), value: stats.netRevenue, icon: DollarSign, color: "text-green-600", money: true },
    { label: t("dash.totalExpenses"), value: stats.totalExpenses, icon: TrendingDown, color: "text-red-600", money: true },
    { label: t("dash.netProfit"), value: stats.netProfit, icon: DollarSign, color: "text-emerald-600", money: true },
    { label: t("dash.vaultTotal"), value: stats.vaultTotal, icon: Wallet, color: "text-indigo-600", money: true },
    { label: t("dash.todaySales"), value: stats.todaySales, icon: ShoppingCart, color: "text-sky-600", money: true },
    { label: t("dash.monthSales"), value: stats.monthSales, icon: ShoppingCart, color: "text-cyan-600", money: true },
  ];

  const mini = [
    { label: t("dash.clients"), value: stats.clientCount, icon: Users, href: "/clients" },
    { label: t("dash.products"), value: stats.productCount, icon: Shirt, href: "/products" },
    { label: t("dash.lowStock"), value: stats.lowStockCount, icon: AlertTriangle, href: "/inventory", warn: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("dash.title")} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-bold">
                  {c.money ? <Money value={c.value} /> : formatMoney(c.value)}
                </p>
              </div>
              <c.icon className={`h-8 w-8 ${c.color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {mini.map((m) => (
          <Link key={m.label} href={m.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{m.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${m.warn && m.value > 0 ? "text-destructive" : ""}`}>
                    {m.value}
                  </p>
                </div>
                <m.icon className={`h-8 w-8 ${m.warn && m.value > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("dash.salesTrend")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stats.salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Line type="monotone" dataKey="sales" name={t("dash.totalSales")} stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="returns" name={t("dash.totalReturns")} stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("dash.monthlyTrend")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.salesByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Bar dataKey="sales" name={t("dash.totalSales")} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name={t("dash.totalExpenses")} fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("dash.topProducts")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stats.topProducts.length === 0 && <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
            {stats.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{name(p.name, p.nameAr)}</span>
                <Badge variant="secondary">{p.qty}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("dash.topClients")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stats.topClients.length === 0 && <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
            {stats.topClients.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{name(c.name, c.nameAr)}</span>
                <span className="font-medium"><Money value={c.revenue} /></span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("dash.expensesByCategory")}</CardTitle></CardHeader>
          <CardContent>
            {stats.expensesByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={stats.expensesByCategory}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={(e) => e.label}
                  >
                    {stats.expensesByCategory.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("dash.recentInvoices")}</CardTitle>
            <Link href="/sales" className="text-sm text-primary flex items-center gap-1">
              {t("action.view")} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentInvoices.length === 0 && <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
            {stats.recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                <div>
                  <span className="font-medium">{inv.invoiceNumber}</span>
                  <span className="ms-2 text-muted-foreground">{name(inv.clientEnglishName, inv.clientArabicName)}</span>
                </div>
                <Money value={inv.grandTotal} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("dash.recentPayments")}</CardTitle>
            <Link href="/receipts" className="text-sm text-primary flex items-center gap-1">
              {t("action.view")} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentReceipts.length === 0 && <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
            {stats.recentReceipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                <div>
                  <span className="font-medium">{r.receiptNumber}</span>
                  <span className="ms-2 text-muted-foreground">{name(r.clientEnglishName, r.clientArabicName)}</span>
                </div>
                <Money value={r.amount} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {stats.lowStockProducts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-destructive">{t("dash.lowStock")}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.lowStockProducts.map((p) => (
              <Badge key={p.id} variant="warning">
                {name(p.englishName, p.arabicName)}: {p.currentQty}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
