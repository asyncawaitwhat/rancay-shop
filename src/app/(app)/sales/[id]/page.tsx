"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Send, Ban, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Money } from "@/components/shared/money";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { useBrand } from "@/hooks/use-brand";
import { getSalesInvoice, postInvoice, cancelInvoice } from "@/lib/firebase/services/invoices";
import { printInvoice } from "@/lib/pdf";
import { formatDate, formatMoney } from "@/lib/utils";
import type { SalesInvoice } from "@/lib/types";

export default function SalesViewPage() {
  return (
    <ScreenGuard screen="sales">
      <SalesView />
    </ScreenGuard>
  );
}

function SalesView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, lang, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const brand = useBrand();
  const [inv, setInv] = useState<SalesInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const i = await getSalesInvoice(id);
      if (!i) setError(true);
      else setInv(i);
    } catch { setError(true); }
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <LoadingState />;
  if (error || !inv) return <ErrorState />;

  async function doPost() {
    if (!inv) return;
    setBusy(true);
    try {
      await postInvoice(
        {
          invoiceDate: typeof inv.invoiceDate === "string" ? inv.invoiceDate : formatDate(inv.invoiceDate),
          clientId: inv.clientId, notes: inv.notes || "",
          lines: inv.lines.map((l) => ({ ...l })),
          invoiceDiscountType: inv.invoiceDiscountType, invoiceDiscountValue: inv.invoiceDiscountValue,
          paidAmount: inv.paidAmount, vaultId: (inv as SalesInvoice & { paymentVaultId?: string }).paymentVaultId || "",
          status: "posted",
        },
        { id: inv.clientId, englishName: inv.clientEnglishName, arabicName: inv.clientArabicName },
        actor,
        inv.id
      );
      toast({ variant: "success", title: t("msg.posted") });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t("invoice.view")} ${inv.invoiceNumber}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/sales")}><ArrowLeft className="h-4 w-4" /> {t("action.back")}</Button>
            {inv.status === "draft" && can("sales", "edit") && (
              <Button variant="secondary" onClick={() => router.push(`/sales/new?id=${inv.id}`)}><Pencil className="h-4 w-4" /> {t("action.edit")}</Button>
            )}
            {inv.status === "draft" && can("sales", "edit") && (
              <Button onClick={doPost} disabled={busy}><Send className="h-4 w-4" /> {t("action.post")}</Button>
            )}
            {inv.status === "posted" && can("sales", "delete") && (
              <Button variant="destructive" onClick={() => setConfirmCancel(true)}><Ban className="h-4 w-4" /> {t("invoice.cancelInvoice")}</Button>
            )}
            {can("sales", "export") && (
              <Button variant="outline" onClick={() => printInvoice(inv, brand, lang)}><FileDown className="h-4 w-4" /> {t("action.exportPdf")}</Button>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
          <Info label={t("common.client")} value={name(inv.clientEnglishName, inv.clientArabicName)} />
          <Info label={t("invoice.date")} value={formatDate(inv.invoiceDate)} />
          <Info label={t("invoice.status")} value={<Badge variant={inv.status === "posted" ? "success" : inv.status === "cancelled" ? "destructive" : "secondary"}>{t(`invoice.${inv.status}`)}</Badge>} />
          <Info label={t("invoice.paymentStatus")} value={<Badge variant={inv.paymentStatus === "paid" ? "success" : inv.paymentStatus === "partial" ? "warning" : "secondary"}>{t(`invoice.${inv.paymentStatus}`)}</Badge>} />
          <Info label={t("common.createdBy")} value={inv.createdByName || "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("invoice.lines")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>{t("common.product")}</TableHead>
              <TableHead>{t("common.quantity")}</TableHead><TableHead>{t("common.price")}</TableHead>
              <TableHead>{t("common.discount")}</TableHead><TableHead className="text-end">{t("invoice.lineTotal")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{inv.lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <div>{name(l.productEnglishName, l.productArabicName)}</div>
                  <div className="text-xs text-muted-foreground">{l.productSku}</div>
                </TableCell>
                <TableCell>{l.quantity}</TableCell>
                <TableCell>{formatMoney(l.price)}</TableCell>
                <TableCell>{formatMoney(l.lineDiscount)}</TableCell>
                <TableCell className="text-end font-medium">{formatMoney(l.lineTotal)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>

          <div className="mt-4 ms-auto max-w-xs space-y-2 text-sm">
            <SumRow label={t("common.subtotal")} value={inv.subtotal} />
            <SumRow label={t("invoice.totalDiscount")} value={inv.totalDiscount} />
            <div className="flex justify-between border-t pt-2 text-base font-bold"><span>{t("invoice.grandTotal")}</span><Money value={inv.grandTotal} /></div>
            <SumRow label={t("invoice.paidAmount")} value={inv.paidAmount} />
            <SumRow label={t("invoice.remaining")} value={inv.remainingAmount} />
          </div>
          {inv.notes && <p className="mt-4 text-sm text-muted-foreground"><strong>{t("common.notes")}:</strong> {inv.notes}</p>}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("invoice.cancelInvoice")}
        description={t("msg.confirmCancel")}
        onConfirm={async () => {
          try {
            await cancelInvoice(inv.id, actor);
            toast({ variant: "success", title: t("msg.cancelled") });
            load();
          } catch (e) {
            toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
          }
        }}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 font-medium">{value}</div></div>;
}
function SumRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span>{formatMoney(value)}</span></div>;
}
