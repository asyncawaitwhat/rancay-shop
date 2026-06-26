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
import { getReturnInvoice, postReturn, cancelReturn } from "@/lib/firebase/services/returns";
import { printReturn } from "@/lib/pdf";
import { formatDate, formatMoney } from "@/lib/utils";
import type { ReturnInvoice } from "@/lib/types";

export default function ReturnViewPage() {
  return (
    <ScreenGuard screen="returns">
      <ReturnView />
    </ScreenGuard>
  );
}

function ReturnView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, lang, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const brand = useBrand();
  const [inv, setInv] = useState<ReturnInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const i = await getReturnInvoice(id);
      if (!i) setError(true); else setInv(i);
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
      await postReturn(
        {
          invoiceDate: typeof inv.invoiceDate === "string" ? inv.invoiceDate : formatDate(inv.invoiceDate),
          clientId: inv.clientId, originalInvoiceId: inv.originalInvoiceId || "", notes: inv.notes || "",
          lines: inv.lines.map((l) => ({ ...l })),
          invoiceDiscountType: inv.invoiceDiscountType, invoiceDiscountValue: inv.invoiceDiscountValue, status: "posted",
        },
        { id: inv.clientId, englishName: inv.clientEnglishName, arabicName: inv.clientArabicName },
        actor, inv.id, inv.originalInvoiceNumber
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
        title={`${t("return.view")} ${inv.invoiceNumber}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/returns")}><ArrowLeft className="h-4 w-4" /> {t("action.back")}</Button>
            {inv.status === "draft" && can("returns", "edit") && (
              <Button variant="secondary" onClick={() => router.push(`/returns/new?id=${inv.id}`)}><Pencil className="h-4 w-4" /> {t("action.edit")}</Button>
            )}
            {inv.status === "draft" && can("returns", "edit") && (
              <Button onClick={doPost} disabled={busy}><Send className="h-4 w-4" /> {t("action.post")}</Button>
            )}
            {inv.status === "posted" && can("returns", "delete") && (
              <Button variant="destructive" onClick={() => setConfirmCancel(true)}><Ban className="h-4 w-4" /> {t("action.cancel")}</Button>
            )}
            {can("returns", "export") && (
              <Button variant="outline" onClick={() => printReturn(inv, brand, lang)}><FileDown className="h-4 w-4" /> {t("action.exportPdf")}</Button>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
          <Info label={t("common.client")} value={name(inv.clientEnglishName, inv.clientArabicName)} />
          <Info label={t("invoice.date")} value={formatDate(inv.invoiceDate)} />
          <Info label={t("invoice.status")} value={<Badge variant={inv.status === "posted" ? "success" : inv.status === "cancelled" ? "destructive" : "secondary"}>{t(`invoice.${inv.status}`)}</Badge>} />
          {inv.originalInvoiceNumber && <Info label={t("return.original")} value={inv.originalInvoiceNumber} />}
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
                <TableCell><div>{name(l.productEnglishName, l.productArabicName)}</div><div className="text-xs text-muted-foreground">{l.productSku}</div></TableCell>
                <TableCell>{l.quantity}</TableCell>
                <TableCell>{formatMoney(l.price)}</TableCell>
                <TableCell>{formatMoney(l.lineDiscount)}</TableCell>
                <TableCell className="text-end font-medium">{formatMoney(l.lineTotal)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <div className="mt-4 ms-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>{t("common.subtotal")}</span><span>{formatMoney(inv.subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>{t("invoice.totalDiscount")}</span><span>{formatMoney(inv.totalDiscount)}</span></div>
            <div className="flex justify-between border-t pt-2 text-base font-bold"><span>{t("invoice.grandTotal")}</span><Money value={inv.grandTotal} /></div>
          </div>
          {inv.notes && <p className="mt-4 text-sm text-muted-foreground"><strong>{t("common.notes")}:</strong> {inv.notes}</p>}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmCancel} onOpenChange={setConfirmCancel}
        title={t("action.cancel")} description={t("msg.confirmCancel")}
        onConfirm={async () => {
          try {
            await cancelReturn(inv.id, actor);
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
