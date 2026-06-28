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
import { listVaults } from "@/lib/firebase/services/vaults";
import { listActiveSalesReps } from "@/lib/firebase/services/salesReps";
import {
  getSalesInvoice, createDraftInvoice, updateDraftInvoice, postInvoice,
} from "@/lib/firebase/services/invoices";
import { salesInvoiceSchema } from "@/lib/schemas";
import { computeTotals, type RawLine } from "@/lib/invoice-math";
import { toISODateInput, formatMoney } from "@/lib/utils";
import type { Client, Product, Vault, SalesRep, DiscountType } from "@/lib/types";

export default function NewSalesPage() {
  return (
    <ScreenGuard screen="sales">
      <SalesEditor />
    </ScreenGuard>
  );
}

function SalesEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const { t, name } = useLang();
  const { actor } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);

  const [clientId, setClientId] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(toISODateInput(new Date()));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RawLine[]>([]);
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<DiscountType>("amount");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [vaultId, setVaultId] = useState("");

  useEffect(() => {
    Promise.all([listClients(), listProducts(), listVaults(), listActiveSalesReps()])
      .then(async ([c, p, v, reps]) => {
        setClients(c.filter((x) => x.status === "active"));
        setProducts(p);
        setVaults(v.filter((x) => x.status === "active"));
        setSalesReps(reps);
        if (editId) {
          const inv = await getSalesInvoice(editId);
          if (inv && inv.status === "draft") {
            setClientId(inv.clientId);
            setSalesRepId(inv.salesRepId || "");
            setInvoiceDate(toISODateInput(inv.invoiceDate));
            setNotes(inv.notes || "");
            setLines(inv.lines.map((l) => ({
              productId: l.productId, productSku: l.productSku, productEnglishName: l.productEnglishName,
              productArabicName: l.productArabicName, quantity: l.quantity, price: l.price,
              discountType: l.discountType, discountValue: l.discountValue,
            })));
            setInvoiceDiscountType(inv.invoiceDiscountType);
            setInvoiceDiscountValue(inv.invoiceDiscountValue);
            setPaidAmount(inv.paidAmount);
          } else if (inv) {
            toast({ variant: "destructive", title: t("msg.error"), description: "Only drafts can be edited." });
            router.replace(`/sales/${editId}`);
          }
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const totals = computeTotals(lines, invoiceDiscountType, invoiceDiscountValue);
  const remaining = Math.max(0, totals.grandTotal - paidAmount);

  const salesRep = salesReps.find((r) => r.id === salesRepId);

  function buildForm(status: "draft" | "posted") {
    return {
      invoiceDate, clientId,
      salesRepId,
      salesRepEnglishName: salesRep?.englishName || "",
      salesRepArabicName: salesRep?.arabicName || "",
      notes, lines, invoiceDiscountType, invoiceDiscountValue,
      paidAmount, vaultId, status,
    };
  }

  function validate(status: "draft" | "posted"): boolean {
    const parsed = salesInvoiceSchema.safeParse(buildForm(status));
    if (!parsed.success) {
      toast({ variant: "destructive", title: t("msg.error"), description: parsed.error.errors[0]?.message });
      return false;
    }
    if (paidAmount > 0 && !vaultId) {
      toast({ variant: "destructive", title: t("msg.error"), description: t("invoice.paymentVault") });
      return false;
    }
    if (status === "posted") {
      for (const l of lines) {
        const p = products.find((x) => x.id === l.productId);
        if (p && l.quantity > p.currentQty) {
          toast({ variant: "destructive", title: t("invoice.insufficientStock"), description: name(p.englishName, p.arabicName) });
          return false;
        }
      }
    }
    return true;
  }

  const client = clients.find((c) => c.id === clientId);
  const clientRef = client ? { id: client.id, englishName: client.englishName, arabicName: client.arabicName } : null;

  async function saveDraft() {
    if (!validate("draft") || !clientRef) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDraftInvoice(editId, buildForm("draft"), clientRef, actor);
        toast({ variant: "success", title: t("msg.saved") });
        router.push(`/sales/${editId}`);
      } else {
        const id = await createDraftInvoice(buildForm("draft"), clientRef, actor);
        toast({ variant: "success", title: t("msg.created") });
        router.push(`/sales/${id}`);
      }
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function post() {
    if (!validate("posted") || !clientRef) return;
    setSaving(true);
    try {
      const id = await postInvoice(buildForm("posted"), clientRef, actor, editId || undefined);
      toast({ variant: "success", title: t("msg.posted") });
      router.push(`/sales/${id}`);
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={editId ? t("invoice.editDraft") : t("invoice.new")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/sales")}><ArrowLeft className="h-4 w-4" /> {t("action.back")}</Button>
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
                  value={clientId}
                  onSelect={setClientId}
                  placeholder={t("invoice.selectClient")}
                />
              </Field>
              <Field label={t("invoice.date")} required>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} dir="ltr" />
              </Field>
              <Field label={t("invoice.salesRep")}>
                <EntityCombobox
                  items={salesReps.map((r) => ({ id: r.id, label: name(r.englishName, r.arabicName), sublabel: r.repCode }))}
                  value={salesRepId}
                  onSelect={setSalesRepId}
                  placeholder={t("invoice.selectSalesRep")}
                />
              </Field>
            </div>
            <LineItemsEditor products={products} lines={lines} onChange={setLines} checkStock />
            <Field label={t("common.notes")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader><CardTitle>{t("common.summary")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label={t("common.subtotal")} value={totals.subtotal} />
            <Row label={t("invoice.lineDiscount")} value={totals.itemDiscountTotal} />
            <div>
              <label className="mb-1 block text-muted-foreground">{t("invoice.invoiceDiscount")}</label>
              <div className="flex gap-2">
                <Input type="number" min={0} step="0.01" dir="ltr" value={invoiceDiscountValue} onChange={(e) => setInvoiceDiscountValue(Number(e.target.value))} />
                <Select value={invoiceDiscountType} onValueChange={(v) => setInvoiceDiscountType(v as DiscountType)}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">#</SelectItem>
                    <SelectItem value="percentage">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Row label={t("invoice.totalDiscount")} value={totals.totalDiscount} />
            <div className="flex items-center justify-between border-t pt-3 text-base font-bold">
              <span>{t("invoice.grandTotal")}</span>
              <span>{formatMoney(totals.grandTotal)}</span>
            </div>
            <div>
              <label className="mb-1 block text-muted-foreground">{t("invoice.paidAmount")}</label>
              <Input type="number" min={0} step="0.01" dir="ltr" value={paidAmount} onChange={(e) => setPaidAmount(Number(e.target.value))} />
            </div>
            {paidAmount > 0 && (
              <Field label={t("invoice.paymentVault")} required>
                <Select value={vaultId} onValueChange={setVaultId}>
                  <SelectTrigger><SelectValue placeholder={t("action.select")} /></SelectTrigger>
                  <SelectContent>
                    {vaults.map((v) => <SelectItem key={v.id} value={v.id}>{name(v.englishName, v.arabicName)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Row label={t("invoice.remaining")} value={remaining} bold />
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmPost}
        onOpenChange={setConfirmPost}
        title={t("action.post")}
        description={t("invoice.confirmPost")}
        confirmLabel={t("action.post")}
        variant="default"
        onConfirm={post}
      />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}
