"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Eye, ArrowLeftRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { vaultSchema, transferSchema, type VaultForm, type TransferForm } from "@/lib/schemas";
import { listVaults, createVault, updateVault, deleteVault } from "@/lib/firebase/services/vaults";
import { transferBetweenVaults } from "@/lib/firebase/services/finance";
import { toISODateInput } from "@/lib/utils";
import type { Vault } from "@/lib/types";

export default function VaultsPage() {
  return (
    <ScreenGuard screen="vaults">
      <VaultsContent />
    </ScreenGuard>
  );
}

function VaultsContent() {
  const { t, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [items, setItems] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Vault | null }>({ open: false, editing: null });
  const [confirm, setConfirm] = useState<Vault | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  async function load() {
    setLoading(true);
    setItems(await listVaults());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const totalBalance = items.reduce((s, v) => s + (v.currentBalance || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.vaults")}
        actions={
          <div className="flex gap-2">
            {items.length >= 2 && can("vaults", "edit") && (
              <Button variant="outline" onClick={() => setTransferOpen(true)}><ArrowLeftRight className="h-4 w-4" /> {t("action.transfer")}</Button>
            )}
            {can("vaults", "create") && (
              <Button onClick={() => setDialog({ open: true, editing: null })}><Plus className="h-4 w-4" /> {t("vault.new")}</Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex items-center justify-between p-5">
            <div><p className="text-sm opacity-80">{t("dash.vaultTotal")}</p><p className="mt-1 text-xl font-bold"><Money value={totalBalance} /></p></div>
            <Wallet className="h-8 w-8 opacity-80" />
          </CardContent>
        </Card>
      </div>

      <Card><CardContent className="p-4">
        {loading ? <LoadingState /> : items.length === 0 ? <EmptyState /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("common.name")}</TableHead><TableHead>{t("common.type")}</TableHead>
              <TableHead>{t("vault.opening")}</TableHead><TableHead>{t("vault.current")}</TableHead>
              <TableHead>{t("common.status")}</TableHead><TableHead className="text-end">{t("action.actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{name(v.englishName, v.arabicName)}</TableCell>
                <TableCell>{t(`vault.${v.type}`)}</TableCell>
                <TableCell><Money value={v.openingBalance} /></TableCell>
                <TableCell className="font-medium"><Money value={v.currentBalance} /></TableCell>
                <TableCell><Badge variant={v.status === "active" ? "success" : "secondary"}>{t(`common.${v.status}`)}</Badge></TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon"><Link href={`/vaults/${v.id}`}><Eye className="h-4 w-4" /></Link></Button>
                    {can("vaults", "edit") && <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, editing: v })}><Pencil className="h-4 w-4" /></Button>}
                    {can("vaults", "delete") && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(v)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>

      {dialog.open && (
        <VaultDialog editing={dialog.editing} actor={actor}
          onClose={() => setDialog({ open: false, editing: null })}
          onSaved={() => { setDialog({ open: false, editing: null }); load(); }} />
      )}
      {transferOpen && (
        <TransferDialog vaults={items.filter((v) => v.status === "active")} actor={actor}
          onClose={() => setTransferOpen(false)} onSaved={() => { setTransferOpen(false); load(); }} />
      )}

      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={t("action.delete")} description={t("msg.confirmDelete")}
        onConfirm={async () => {
          if (!confirm) return;
          try { await deleteVault(confirm.id, actor); toast({ variant: "success", title: t("msg.deleted") }); setConfirm(null); load(); }
          catch (e) { toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message }); }
        }} />
    </div>
  );
}

function VaultDialog({ editing, actor, onClose, onSaved }: {
  editing: Vault | null; actor: ReturnType<typeof useAuth>["actor"]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLang();
  const form = useForm<VaultForm>({
    resolver: zodResolver(vaultSchema),
    defaultValues: editing
      ? { englishName: editing.englishName, arabicName: editing.arabicName, type: editing.type, openingBalance: editing.openingBalance, status: editing.status, notes: editing.notes || "" }
      : { englishName: "", arabicName: "", type: "cash", openingBalance: 0, status: "active", notes: "" },
  });
  const e = form.formState.errors;
  async function onSubmit(data: VaultForm) {
    try {
      if (editing) { await updateVault(editing.id, data, actor); toast({ variant: "success", title: t("msg.updated") }); }
      else { await createVault(data, actor); toast({ variant: "success", title: t("msg.created") }); }
      onSaved();
    } catch (err) { toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message }); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? t("vault.edit") : t("vault.new")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("common.englishName")} required error={e.englishName?.message}><Input {...form.register("englishName")} dir="ltr" /></Field>
            <Field label={t("common.arabicName")} required error={e.arabicName?.message}><Input {...form.register("arabicName")} dir="rtl" /></Field>
            <Field label={t("common.type")}>
              <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as "cash" | "bank" | "custom")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("vault.cash")}</SelectItem>
                  <SelectItem value="bank">{t("vault.bank")}</SelectItem>
                  <SelectItem value="custom">{t("vault.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("vault.opening")} error={e.openingBalance?.message}><Input type="number" step="0.01" {...form.register("openingBalance")} dir="ltr" /></Field>
          </div>
          <Field label={t("common.status")}>
            <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">{t("common.active")}</SelectItem><SelectItem value="inactive">{t("common.inactive")}</SelectItem></SelectContent>
            </Select>
          </Field>
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

function TransferDialog({ vaults, actor, onClose, onSaved }: {
  vaults: Vault[]; actor: ReturnType<typeof useAuth>["actor"]; onClose: () => void; onSaved: () => void;
}) {
  const { t, name } = useLang();
  const form = useForm<TransferForm>({
    resolver: zodResolver(transferSchema),
    defaultValues: { date: toISODateInput(new Date()), fromVaultId: "", toVaultId: "", amount: 0, notes: "" },
  });
  const e = form.formState.errors;
  async function onSubmit(data: TransferForm) {
    try { await transferBetweenVaults(data, actor); toast({ variant: "success", title: t("msg.transferDone") }); onSaved(); }
    catch (err) { toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message }); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("transfer.title")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label={t("common.date")}><Input type="date" {...form.register("date")} dir="ltr" /></Field>
          <Field label={t("transfer.from")} required error={e.fromVaultId?.message}>
            <Select value={form.watch("fromVaultId")} onValueChange={(v) => form.setValue("fromVaultId", v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder={t("action.select")} /></SelectTrigger>
              <SelectContent>{vaults.map((v) => <SelectItem key={v.id} value={v.id}>{name(v.englishName, v.arabicName)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={t("transfer.to")} required error={e.toVaultId?.message}>
            <Select value={form.watch("toVaultId")} onValueChange={(v) => form.setValue("toVaultId", v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder={t("action.select")} /></SelectTrigger>
              <SelectContent>{vaults.map((v) => <SelectItem key={v.id} value={v.id}>{name(v.englishName, v.arabicName)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={t("common.amount")} required error={e.amount?.message}><Input type="number" step="0.01" {...form.register("amount")} dir="ltr" /></Field>
          <Field label={t("common.notes")}><Textarea {...form.register("notes")} /></Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>{t("action.transfer")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
