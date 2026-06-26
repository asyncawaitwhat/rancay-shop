"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Money } from "@/components/shared/money";
import { useLang } from "@/components/providers/language-provider";
import { getVault } from "@/lib/firebase/services/vaults";
import { listVaultTransactions } from "@/lib/firebase/services/finance";
import { formatDate, formatMoney, toDate } from "@/lib/utils";
import type { Vault, FinanceTransaction } from "@/lib/types";

export default function VaultProfilePage() {
  return (
    <ScreenGuard screen="vaults">
      <VaultProfile />
    </ScreenGuard>
  );
}

function VaultProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, name } = useLang();
  const [vault, setVault] = useState<Vault | null>(null);
  const [txns, setTxns] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([getVault(id), listVaultTransactions(id)])
      .then(([v, tx]) => {
        if (!v) { setError(true); return; }
        setVault(v);
        setTxns(tx.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState />;
  if (error || !vault) return <ErrorState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={name(vault.englishName, vault.arabicName)}
        description={t(`vault.${vault.type}`)}
        actions={<Button variant="outline" onClick={() => router.push("/vaults")}><ArrowLeft className="h-4 w-4" /> {t("action.back")}</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t("vault.opening")}</p><p className="mt-1 text-xl font-bold"><Money value={vault.openingBalance} /></p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t("vault.current")}</p><p className="mt-1 text-xl font-bold text-primary"><Money value={vault.currentBalance} /></p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t("common.status")}</p><div className="mt-1"><Badge variant={vault.status === "active" ? "success" : "secondary"}>{t(`common.${vault.status}`)}</Badge></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("vault.transactions")}</CardTitle></CardHeader>
        <CardContent>
          {txns.length === 0 ? <EmptyState /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("trx.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.type")}</TableHead><TableHead>{t("common.reference")}</TableHead>
                <TableHead className="text-end">{t("common.amount")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{txns.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-xs">{tx.transactionNumber}</TableCell>
                  <TableCell>{formatDate(tx.date)}</TableCell>
                  <TableCell><Badge variant="outline">{t(`trx.${typeKey(tx.type)}`)}</Badge></TableCell>
                  <TableCell className="text-xs">{tx.referenceNumber || tx.notes || "—"}</TableCell>
                  <TableCell className={`text-end font-medium ${tx.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                    {tx.amount > 0 ? "+" : ""}{formatMoney(tx.amount)}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function typeKey(type: string): string {
  const map: Record<string, string> = {
    income: "income", expense: "expense", transfer_in: "transferIn", transfer_out: "transferOut",
    invoice_payment: "invoicePayment", return_refund: "returnRefund", adjustment: "adjustment",
  };
  return map[type] || "adjustment";
}
