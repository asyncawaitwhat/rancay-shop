"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { useLang } from "@/components/providers/language-provider";
import { listTransactions } from "@/lib/firebase/services/finance";
import { listVaults } from "@/lib/firebase/services/vaults";
import { formatDate, formatMoney } from "@/lib/utils";
import type { FinanceTransaction, Vault } from "@/lib/types";

export default function TransactionsPage() {
  return (
    <ScreenGuard screen="transactions">
      <TransactionsContent />
    </ScreenGuard>
  );
}

function typeKey(type: string): string {
  const map: Record<string, string> = {
    income: "income", expense: "expense", transfer_in: "transferIn", transfer_out: "transferOut",
    invoice_payment: "invoicePayment", return_refund: "returnRefund", adjustment: "adjustment",
  };
  return map[type] || "adjustment";
}

function TransactionsContent() {
  const { t, name } = useLang();
  const [items, setItems] = useState<FinanceTransaction[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vaultFilter, setVaultFilter] = useState("all");

  useEffect(() => {
    Promise.all([listTransactions(), listVaults()])
      .then(([tx, v]) => { setItems(tx); setVaults(v); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((tx) => {
    const s = `${tx.transactionNumber} ${tx.referenceNumber || ""} ${tx.notes || ""}`.toLowerCase();
    return s.includes(search.toLowerCase()) && (vaultFilter === "all" || tx.vaultId === vaultFilter);
  });
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 15);

  const summary = useMemo(() => {
    const income = filtered.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
    const expense = filtered.filter((x) => x.amount < 0).reduce((s, x) => s + Math.abs(x.amount), 0);
    return { income, expense, net: income - expense };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("trx.ledger")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t("trx.income")}</p><p className="mt-1 text-lg font-bold text-green-600">{formatMoney(summary.income)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t("trx.expense")}</p><p className="mt-1 text-lg font-bold text-destructive">{formatMoney(summary.expense)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t("dash.netRevenue")}</p><p className="mt-1 text-lg font-bold">{formatMoney(summary.net)}</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={vaultFilter} onValueChange={setVaultFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t("common.vault")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {vaults.map((v) => <SelectItem key={v.id} value={v.id}>{name(v.englishName, v.arabicName)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("trx.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.vault")}</TableHead><TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("common.reference")}</TableHead><TableHead className="text-end">{t("common.amount")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{paged.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-xs">{tx.transactionNumber}</TableCell>
                  <TableCell>{formatDate(tx.date)}</TableCell>
                  <TableCell>{name(tx.vaultEnglishName, tx.vaultArabicName)}</TableCell>
                  <TableCell><Badge variant="outline">{t(`trx.${typeKey(tx.type)}`)}</Badge></TableCell>
                  <TableCell className="text-xs">{tx.referenceNumber || tx.notes || "—"}</TableCell>
                  <TableCell className={`text-end font-medium ${tx.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                    {tx.amount > 0 ? "+" : ""}{formatMoney(tx.amount)}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
