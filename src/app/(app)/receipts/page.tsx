"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, FileDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { Money } from "@/components/shared/money";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { useBrand } from "@/hooks/use-brand";
import { receiptSchema, type ReceiptForm } from "@/lib/schemas";
import { listReceipts, createReceipt, deleteReceipt } from "@/lib/firebase/services/finance";
import { listVaults } from "@/lib/firebase/services/vaults";
import { listClients } from "@/lib/firebase/services/clients";
import { printReceipt } from "@/lib/pdf";
import { toISODateInput, formatDate } from "@/lib/utils";
import type { ReceiptSlip, Vault, Client } from "@/lib/types";

export default function ReceiptsPage() {
  return (
    <ScreenGuard screen="receipts">
      <ReceiptsContent />
    </ScreenGuard>
  );
}

function ReceiptsContent() {
  const { t, lang, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const brand = useBrand();
  const [items, setItems] = useState<ReceiptSlip[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ReceiptSlip | null>(null);

  async function load() {
    setLoading(true);
    const [r, v, c] = await Promise.all([listReceipts(), listVaults(), listClients()]);
    setItems(r); setVaults(v); setClients(c); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((r) =>
    `${r.receiptNumber} ${r.clientEnglishName} ${r.clientArabicName}`.toLowerCase().includes(search.toLowerCase())
  );
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 12);

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.receipts")}
        actions={can("receipts", "create") && (
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t("receipt.new")}</Button>
        )}
      />
      <Card><CardContent className="p-4">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("receipt.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.client")}</TableHead><TableHead>{t("common.vault")}</TableHead>
                <TableHead>{t("receipt.method")}</TableHead><TableHead>{t("common.amount")}</TableHead>
                <TableHead className="text-end">{t("action.actions")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{paged.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.receiptNumber}</TableCell>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell>{name(r.clientEnglishName, r.clientArabicName)}</TableCell>
                  <TableCell>{name(r.vaultEnglishName, r.vaultArabicName)}</TableCell>
                  <TableCell>{t(`receipt.${r.paymentMethod}`)}</TableCell>
                  <TableCell><Money value={r.amount} /></TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      {can("receipts", "export") && <Button variant="ghost" size="icon" onClick={() => printReceipt(r, brand, lang)}><FileDown className="h-4 w-4" /></Button>}
                      {can("receipts", "delete") && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(r)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
          </>
        )}
      </CardContent></Card>

      {open && <ReceiptDialog vaults={vaults.filter((v) => v.status === "active")} clients={clients.filter((c) => c.status === "active")} actor={actor}
        onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}

      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={t("action.delete")} description={t("msg.confirmDelete")}
        onConfirm={async () => {
          if (!confirm) return;
          try { await deleteReceipt(confirm.id, actor); toast({ variant: "success", title: t("msg.deleted") }); setConfirm(null); load(); }
          catch (e) { toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message }); }
        }} />
    </div>
  );
}

function ReceiptDialog({ vaults, clients, actor, onClose, onSaved }: {
  vaults: Vault[]; clients: Client[]; actor: ReturnType<typeof useAuth>["actor"]; onClose: () => void; onSaved: () => void;
}) {
  const { t, name } = useLang();
  const form = useForm<ReceiptForm>({
    resolver: zodResolver(receiptSchema),
    defaultValues: { date: toISODateInput(new Date()), clientId: "", vaultId: "", amount: 0, paymentMethod: "cash", notes: "" },
  });
  const e = form.formState.errors;
  async function onSubmit(data: ReceiptForm) {
    const client = clients.find((c) => c.id === data.clientId);
    if (!client) return;
    try {
      await createReceipt(data, { id: client.id, englishName: client.englishName, arabicName: client.arabicName }, actor);
      toast({ variant: "success", title: t("msg.created") });
      onSaved();
    } catch (err) { toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message }); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("receipt.new")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label={t("common.client")} required error={e.clientId?.message}>
            <EntityCombobox
              items={clients.map((c) => ({ id: c.id, label: name(c.englishName, c.arabicName), sublabel: `${c.clientCode} • ${c.phone}`, keywords: c.clientCode }))}
              value={form.watch("clientId")} onSelect={(id) => form.setValue("clientId", id, { shouldValidate: true })}
              placeholder={t("invoice.selectClient")}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("common.date")} required error={e.date?.message}><Input type="date" {...form.register("date")} dir="ltr" /></Field>
            <Field label={t("common.vault")} required error={e.vaultId?.message}>
              <Select value={form.watch("vaultId")} onValueChange={(v) => form.setValue("vaultId", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder={t("action.select")} /></SelectTrigger>
                <SelectContent>{vaults.map((v) => <SelectItem key={v.id} value={v.id}>{name(v.englishName, v.arabicName)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t("common.amount")} required error={e.amount?.message}><Input type="number" step="0.01" {...form.register("amount")} dir="ltr" /></Field>
            <Field label={t("receipt.method")}>
              <Select value={form.watch("paymentMethod")} onValueChange={(v) => form.setValue("paymentMethod", v as "cash" | "bank" | "other")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("receipt.cash")}</SelectItem>
                  <SelectItem value="bank">{t("receipt.bank")}</SelectItem>
                  <SelectItem value="other">{t("receipt.other")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t("common.notes")}><Textarea {...form.register("notes")} /></Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>{t("action.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
