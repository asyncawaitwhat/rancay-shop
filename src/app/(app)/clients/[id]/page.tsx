"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Money } from "@/components/shared/money";
import { useLang } from "@/components/providers/language-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { useBrand } from "@/hooks/use-brand";
import { getClient } from "@/lib/firebase/services/clients";
import { listClientInvoices } from "@/lib/firebase/services/invoices";
import { listClientReturns } from "@/lib/firebase/services/returns";
import { listClientReceipts } from "@/lib/firebase/services/finance";
import { printClientStatement } from "@/lib/pdf";
import { formatDate } from "@/lib/utils";
import type { Client, SalesInvoice, ReturnInvoice, ReceiptSlip } from "@/lib/types";

export default function ClientProfilePage() {
  return (
    <ScreenGuard screen="clients">
      <ClientProfileContent />
    </ScreenGuard>
  );
}

function ClientProfileContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, lang, name } = useLang();
  const { can } = usePermissions();
  const brand = useBrand();
  const [client, setClient] = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [returns, setReturns] = useState<ReturnInvoice[]>([]);
  const [receipts, setReceipts] = useState<ReceiptSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      getClient(id),
      listClientInvoices(id),
      listClientReturns(id),
      listClientReceipts(id),
    ])
      .then(([c, inv, ret, rec]) => {
        if (!c) { setError(true); return; }
        setClient(c);
        setInvoices(inv.sort(byDateDesc));
        setReturns(ret.sort(byDateDesc));
        setReceipts(rec.sort((a, b) => dateNum(b.date) - dateNum(a.date)));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const mostPurchased = useMemo(() => {
    const agg = new Map<string, { name: string; nameAr: string; qty: number }>();
    invoices.filter((i) => i.status === "posted").forEach((i) =>
      i.lines.forEach((l) => {
        const cur = agg.get(l.productId) || { name: l.productEnglishName, nameAr: l.productArabicName, qty: 0 };
        cur.qty += l.quantity;
        agg.set(l.productId, cur);
      })
    );
    return [...agg.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [invoices]);

  if (loading) return <LoadingState />;
  if (error || !client) return <ErrorState />;

  function exportStatement() {
    if (!client) return;
    const rows = [
      ...invoices.filter((i) => i.status === "posted").map((i) => ({
        date: i.invoiceDate, doc: i.invoiceNumber, type: t("nav.sales"), debit: i.grandTotal, credit: 0,
      })),
      ...returns.filter((r) => r.status === "posted").map((r) => ({
        date: r.invoiceDate, doc: r.invoiceNumber, type: t("nav.returns"), debit: 0, credit: r.grandTotal,
      })),
      ...receipts.map((r) => ({
        date: r.date, doc: r.receiptNumber, type: t("receipt.slip"), debit: 0, credit: r.amount,
      })),
    ].sort((a, b) => dateNum(a.date) - dateNum(b.date));
    printClientStatement(client, rows, brand, lang);
  }

  const netSales = client.totalSales - client.totalReturns;

  return (
    <div className="space-y-6">
      <PageHeader
        title={name(client.englishName, client.arabicName)}
        description={`${t("client.code")}: ${client.clientCode}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/clients")}>
              <ArrowLeft className="h-4 w-4" /> {t("action.back")}
            </Button>
            {can("clients", "export") && (
              <Button onClick={exportStatement}>
                <FileText className="h-4 w-4" /> {t("client.statement")}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label={t("client.totalSales")} value={client.totalSales} />
        <Stat label={t("client.totalReturns")} value={client.totalReturns} />
        <Stat label={t("client.netSales")} value={netSales} />
        <Stat label={t("client.totalPaid")} value={client.totalPaid} />
        <Stat label={t("client.balance")} value={client.balance} highlight />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>{t("client.profile")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span dir="ltr">{client.phone}</span></div>
            {client.secondPhone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span dir="ltr">{client.secondPhone}</span></div>}
            {client.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span dir="ltr">{client.email}</span></div>}
            {(client.address || client.city) && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{[client.address, client.city].filter(Boolean).join(", ")}</span></div>}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground">{t("common.status")}</span>
              <Badge variant={client.status === "active" ? "success" : "secondary"}>{t(`common.${client.status}`)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("client.lastPurchase")}</span>
              <span>{client.lastPurchaseAt ? formatDate(client.lastPurchaseAt) : "—"}</span>
            </div>
            {client.notes && <p className="border-t pt-3 text-muted-foreground">{client.notes}</p>}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">{t("client.invoices")} ({invoices.length})</TabsTrigger>
              <TabsTrigger value="returns">{t("client.returns")} ({returns.length})</TabsTrigger>
              <TabsTrigger value="receipts">{t("client.receipts")} ({receipts.length})</TabsTrigger>
              <TabsTrigger value="products">{t("client.mostPurchased")}</TabsTrigger>
            </TabsList>

            <TabsContent value="invoices">
              <Card><CardContent className="p-4">
                {invoices.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("invoice.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("invoice.status")}</TableHead><TableHead>{t("invoice.grandTotal")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{invoices.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell><Link href={`/sales/${i.id}`} className="text-primary hover:underline">{i.invoiceNumber}</Link></TableCell>
                        <TableCell>{formatDate(i.invoiceDate)}</TableCell>
                        <TableCell><StatusBadge status={i.status} /></TableCell>
                        <TableCell><Money value={i.grandTotal} /></TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="returns">
              <Card><CardContent className="p-4">
                {returns.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("return.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("invoice.status")}</TableHead><TableHead>{t("invoice.grandTotal")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{returns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell><Link href={`/returns/${r.id}`} className="text-primary hover:underline">{r.invoiceNumber}</Link></TableCell>
                        <TableCell>{formatDate(r.invoiceDate)}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell><Money value={r.grandTotal} /></TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="receipts">
              <Card><CardContent className="p-4">
                {receipts.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("receipt.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("receipt.method")}</TableHead><TableHead>{t("common.amount")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{receipts.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.receiptNumber}</TableCell>
                        <TableCell>{formatDate(r.date)}</TableCell>
                        <TableCell>{t(`receipt.${r.paymentMethod}`)}</TableCell>
                        <TableCell><Money value={r.amount} /></TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="products">
              <Card><CardContent className="p-4">
                {mostPurchased.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("common.product")}</TableHead><TableHead>{t("common.quantity")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{mostPurchased.map((p, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{name(p.name, p.nameAr)}</TableCell>
                        <TableCell><Badge variant="secondary">{p.qty}</Badge></TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-bold ${highlight ? "text-primary" : ""}`}><Money value={value} /></p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLang();
  const variant = status === "posted" ? "success" : status === "cancelled" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(`invoice.${status}`)}</Badge>;
}

function dateNum(d: unknown): number {
  if (!d) return 0;
  const anyD = d as { toDate?: () => Date };
  if (typeof anyD.toDate === "function") return anyD.toDate().getTime();
  return new Date(d as string).getTime() || 0;
}
function byDateDesc(a: { invoiceDate: unknown }, b: { invoiceDate: unknown }) {
  return dateNum(b.invoiceDate) - dateNum(a.invoiceDate);
}
