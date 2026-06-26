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
import { ImageUpload } from "@/components/shared/image-upload";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { useBrand } from "@/hooks/use-brand";
import { expenseSchema, type ExpenseForm } from "@/lib/schemas";
import { listExpenses, createExpense, deleteExpense } from "@/lib/firebase/services/finance";
import { listVaults } from "@/lib/firebase/services/vaults";
import { printExpense } from "@/lib/pdf";
import { toISODateInput, formatDate } from "@/lib/utils";
import type { ExpenseSlip, Vault } from "@/lib/types";

export default function ExpensesPage() {
  return (
    <ScreenGuard screen="expenses">
      <ExpensesContent />
    </ScreenGuard>
  );
}

function ExpensesContent() {
  const { t, lang, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const brand = useBrand();
  const [items, setItems] = useState<ExpenseSlip[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ExpenseSlip | null>(null);

  async function load() {
    setLoading(true);
    const [e, v] = await Promise.all([listExpenses(), listVaults()]);
    setItems(e); setVaults(v); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((e) =>
    `${e.expenseNumber} ${e.category} ${e.paidTo || ""}`.toLowerCase().includes(search.toLowerCase())
  );
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 12);

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.expenses")}
        actions={can("expenses", "create") && (
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t("expense.new")}</Button>
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
                <TableHead>{t("expense.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("expense.category")}</TableHead><TableHead>{t("common.vault")}</TableHead>
                <TableHead>{t("expense.paidTo")}</TableHead><TableHead>{t("common.amount")}</TableHead>
                <TableHead className="text-end">{t("action.actions")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{paged.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.expenseNumber}</TableCell>
                  <TableCell>{formatDate(e.date)}</TableCell>
                  <TableCell>{e.category}</TableCell>
                  <TableCell>{name(e.vaultEnglishName, e.vaultArabicName)}</TableCell>
                  <TableCell>{e.paidTo || "—"}</TableCell>
                  <TableCell><Money value={e.amount} /></TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      {can("expenses", "export") && <Button variant="ghost" size="icon" onClick={() => printExpense(e, brand, lang)}><FileDown className="h-4 w-4" /></Button>}
                      {can("expenses", "delete") && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(e)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
          </>
        )}
      </CardContent></Card>

      {open && <ExpenseDialog vaults={vaults.filter((v) => v.status === "active")} actor={actor}
        onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}

      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={t("action.delete")} description={t("msg.confirmDelete")}
        onConfirm={async () => {
          if (!confirm) return;
          try { await deleteExpense(confirm.id, actor); toast({ variant: "success", title: t("msg.deleted") }); setConfirm(null); load(); }
          catch (e) { toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message }); }
        }} />
    </div>
  );
}

function ExpenseDialog({ vaults, actor, onClose, onSaved }: {
  vaults: Vault[]; actor: ReturnType<typeof useAuth>["actor"]; onClose: () => void; onSaved: () => void;
}) {
  const { t, name } = useLang();
  const form = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { date: toISODateInput(new Date()), vaultId: "", category: "", amount: 0, paidTo: "", notes: "", attachmentBase64: "" },
  });
  const e = form.formState.errors;
  async function onSubmit(data: ExpenseForm) {
    try { await createExpense(data, actor); toast({ variant: "success", title: t("msg.created") }); onSaved(); }
    catch (err) { toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message }); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("expense.new")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("common.date")} required error={e.date?.message}><Input type="date" {...form.register("date")} dir="ltr" /></Field>
            <Field label={t("common.vault")} required error={e.vaultId?.message}>
              <Select value={form.watch("vaultId")} onValueChange={(v) => form.setValue("vaultId", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder={t("action.select")} /></SelectTrigger>
                <SelectContent>{vaults.map((v) => <SelectItem key={v.id} value={v.id}>{name(v.englishName, v.arabicName)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t("expense.category")} required error={e.category?.message}><Input {...form.register("category")} /></Field>
            <Field label={t("common.amount")} required error={e.amount?.message}><Input type="number" step="0.01" {...form.register("amount")} dir="ltr" /></Field>
            <Field label={t("expense.paidTo")}><Input {...form.register("paidTo")} /></Field>
          </div>
          <Field label={t("common.notes")}><Textarea {...form.register("notes")} /></Field>
          <Field label={t("expense.attachment")}>
            <ImageUpload value={form.watch("attachmentBase64")} onChange={(v) => form.setValue("attachmentBase64", v)} />
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>{t("action.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
