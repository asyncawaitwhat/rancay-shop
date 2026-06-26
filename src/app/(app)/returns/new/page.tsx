"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Send, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Field } from "@/components/shared/field";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { LineItemsEditor } from "@/components/invoices/line-items-editor";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { listClients } from "@/lib/firebase/services/clients";
import { listProducts } from "@/lib/firebase/services/products";
import {
  getReturnInvoice, createDraftReturn, updateDraftReturn, postReturn,
} from "@/lib/firebase/services/returns";
import { listClientInvoices } from "@/lib/firebase/services/invoices";
import { returnInvoiceSchema } from "@/lib/schemas";
import { computeTotals, type RawLine } from "@/lib/invoice-math";
import { toISODateInput, formatMoney } from "@/lib/utils";
import type { Client, Product, DiscountType, SalesInvoice } from "@/lib/types";

export default function NewReturnPage() {
  return (
    <ScreenGuard screen="returns">
      <ReturnEditor />
    </ScreenGuard>
  );
}

function ReturnEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const { t, name } = useLang();
  const { actor } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clientInvoices, setClientInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);

  const [clientId, setClientId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(toISODateInput(new Date()));
  const [notes, setNotes] = useState("");
  const [originalInvoiceId, setOriginalInvoiceId] = useState("");
  const [lines, setLines] = useState<RawLine[]>([]);
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<DiscountType>("amount");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState(0);

  useEffect(() => {
    Promise.all([listClients(), listProducts()])
      .then(async ([c, p]) => {
        setClients(c.filter((x) => x.status === "active"));
        setProducts(p);
        if (editId) {
          const inv = await getReturnInvoice(editId);
          if (inv && inv.status === "draft") {
            setClientId(inv.clientId);
            setInvoiceDate(toISODateInput(inv.invoiceDate));
            setNotes(inv.notes || "");
            setOriginalInvoiceId(inv.originalInvoiceId || "");
            setLines(inv.lines.map((l) => ({
              productId: l.productId, productSku: l.productSku, productEnglishName: l.productEnglishName,
              productArabicName: l.productArabicName, quantity: l.quantity, price: l.price,
              discountType: l.discountType, discountValue: l.discountValue,
            })));
            setInvoiceDiscountType(inv.invoiceDiscountType);
            setInvoiceDiscountValue(inv.invoiceDiscountValue);
          } else if (inv) {
            router.replace(`/returns/${editId}`);
          }
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Load the chosen client's invoices for optional linking.
  useEffect(() => {
    if (clientId) listClientInvoices(clientId).then((inv) => setClientInvoices(inv.filter((i) => i.status === "posted")));
    else setClientInvoices([]);
  }, [clientId]);

  const totals = computeTotals(lines, invoiceDiscountType, invoiceDiscountValue);

  function buildForm(status: "draft" | "posted") {
    return { invoiceDate, clientId, originalInvoiceId, notes, lines, invoiceDiscountType, invoiceDiscountValue, status };
  }
  function validate(status: "draft" | "posted"): boolean {
    const parsed = returnInvoiceSchema.safeParse(buildForm(status));
    if (!parsed.success) {
      toast({ variant: "destructive", title: t("msg.error"), description: parsed.error.errors[0]?.message });
      return false;
    }
    return true;
  }

  const client = clients.find((c) => c.id === clientId);
  const clientRef = client ? { id: client.id, englishName: client.englishName, arabicName: client.arabicName } : null;
  const originalNumber = clientInvoices.find((i) => i.id === originalInvoiceId)?.invoiceNumber;

  async function saveDraft() {
    if (!validate("draft") || !clientRef) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDraftReturn(editId, buildForm("draft"), clientRef, actor, originalNumber);
        toast({ variant: "success", title: t("msg.saved") });
        router.push(`/returns/${editId}`);
      } else {
        const id = await createDraftReturn(buildForm("draft"), clientRef, actor, originalNumber);
        toast({ variant: "success", title: t("msg.created") });
        router.push(`/returns/${id}`);
      }
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    } finally { setSaving(false); }
  }

  async function post() {
    if (!validate("posted") || !clientRef) return;
    setSaving(true);
    try {
      const id = await postReturn(buildForm("posted"), clientRef, actor, editId || undefined, originalNumber);
      toast({ variant: "success", title: t("msg.posted") });
      router.push(`/returns/${id}`);
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={editId ? t("return.editDraft") : t("return.new")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/returns")}><ArrowLeft className="h-4 w-4" /> {t("action.back")}</Button>
            <Button variant="secondary" onClick={saveDraft} disabled={saving}><Save className="h-4 w-4" /> {t("invoice.draft")}</Button>
            <Button onClick={() => { if (validate("posted")) setConfirmPost(true); }} disabled={saving}><Send className="h-4 w-4" /> {t("action.post")}</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("invoice.lines")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("common.client")} required>
                <EntityCombobox
                  items={clients.map((c) => ({ id: c.id, label: name(c.englishName, c.arabicName), sublabel: `${c.clientCode} • ${c.phone}`, keywords: c.clientCode }))}
                  value={clientId} onSelect={setClientId} placeholder={t("invoice.selectClient")}
                />
              </Field>
              <Field label={t("invoice.date")} required>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} dir="ltr" />
              </Field>
              {clientId && clientInvoices.length > 0 && (
                <Field label={t("return.original")}>
                  <Select value={originalInvoiceId || "none"} onValueChange={(v) => setOriginalInvoiceId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder={t("common.none")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("common.none")}</SelectItem>
                      {clientInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.invoiceNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
            <LineItemsEditor products={products} lines={lines} onChange={setLines} />
            <Field label={t("common.notes")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader><CardTitle>{t("common.summary")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>{t("common.subtotal")}</span><span>{formatMoney(totals.subtotal)}</span></div>
            <div>
              <label className="mb-1 block text-muted-foreground">{t("invoice.invoiceDiscount")}</label>
              <div className="flex gap-2">
                <Input type="number" min={0} step="0.01" dir="ltr" value={invoiceDiscountValue} onChange={(e) => setInvoiceDiscountValue(Number(e.target.value))} />
                <Select value={invoiceDiscountType} onValueChange={(v) => setInvoiceDiscountType(v as DiscountType)}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="amount">#</SelectItem><SelectItem value="percentage">%</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between text-muted-foreground"><span>{t("invoice.totalDiscount")}</span><span>{formatMoney(totals.totalDiscount)}</span></div>
            <div className="flex items-center justify-between border-t pt-3 text-base font-bold"><span>{t("invoice.grandTotal")}</span><span>{formatMoney(totals.grandTotal)}</span></div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmPost} onOpenChange={setConfirmPost}
        title={t("action.post")} description={t("return.confirmPost")}
        confirmLabel={t("action.post")} variant="default" onConfirm={post}
      />
    </div>
  );
}
