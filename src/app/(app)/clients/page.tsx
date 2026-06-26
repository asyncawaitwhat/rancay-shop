"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
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
import { Pagination, usePagination } from "@/components/shared/pagination";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { clientSchema, type ClientForm } from "@/lib/schemas";
import { listClients, createClient, updateClient, deleteClient } from "@/lib/firebase/services/clients";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  return (
    <ScreenGuard screen="clients">
      <ClientsContent />
    </ScreenGuard>
  );
}

function ClientsContent() {
  const { t } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialog, setDialog] = useState<{ open: boolean; editing: Client | null }>({ open: false, editing: null });
  const [confirm, setConfirm] = useState<Client | null>(null);

  async function load() {
    setLoading(true);
    setItems(await listClients());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((c) => {
    const matchesSearch = `${c.englishName} ${c.arabicName} ${c.phone} ${c.clientCode}`
      .toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.clients")}
        actions={can("clients", "create") && (
          <Button onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="h-4 w-4" /> {t("client.new")}
          </Button>
        )}
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="active">{t("common.active")}</SelectItem>
                <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("client.code")}</TableHead>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.phone")}</TableHead>
                    <TableHead>{t("client.balance")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-end">{t("action.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.clientCode}</TableCell>
                      <TableCell>
                        <div className="font-medium">{c.englishName}</div>
                        <div className="text-xs text-muted-foreground" dir="rtl">{c.arabicName}</div>
                      </TableCell>
                      <TableCell dir="ltr">{c.phone}</TableCell>
                      <TableCell><Money value={c.balance} /></TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "success" : "secondary"}>{t(`common.${c.status}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon">
                            <Link href={`/clients/${c.id}`}><Eye className="h-4 w-4" /></Link>
                          </Button>
                          {can("clients", "edit") && (
                            <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, editing: c })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {can("clients", "delete") && (
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(c)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {dialog.open && (
        <ClientDialog
          editing={dialog.editing}
          actor={actor}
          onClose={() => setDialog({ open: false, editing: null })}
          onSaved={() => { setDialog({ open: false, editing: null }); load(); }}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("action.delete")}
        description={t("msg.confirmDelete")}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await deleteClient(confirm.id, actor);
            toast({ variant: "success", title: t("msg.deleted") });
            setConfirm(null);
            load();
          } catch (e) {
            toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
          }
        }}
      />
    </div>
  );
}

function ClientDialog({
  editing, actor, onClose, onSaved,
}: {
  editing: Client | null;
  actor: ReturnType<typeof useAuth>["actor"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const form = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: editing
      ? {
          englishName: editing.englishName, arabicName: editing.arabicName, phone: editing.phone,
          secondPhone: editing.secondPhone || "", email: editing.email || "", address: editing.address || "",
          city: editing.city || "", notes: editing.notes || "", status: editing.status,
        }
      : { englishName: "", arabicName: "", phone: "", secondPhone: "", email: "", address: "", city: "", notes: "", status: "active" },
  });
  const e = form.formState.errors;

  async function onSubmit(data: ClientForm) {
    try {
      if (editing) {
        await updateClient(editing.id, data, actor);
        toast({ variant: "success", title: t("msg.updated") });
      } else {
        await createClient(data, actor);
        toast({ variant: "success", title: t("msg.created") });
      }
      onSaved();
    } catch (err) {
      toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? t("client.edit") : t("client.new")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("common.englishName")} required error={e.englishName?.message}>
              <Input {...form.register("englishName")} dir="ltr" />
            </Field>
            <Field label={t("common.arabicName")} required error={e.arabicName?.message}>
              <Input {...form.register("arabicName")} dir="rtl" />
            </Field>
            <Field label={t("common.phone")} required error={e.phone?.message}>
              <Input {...form.register("phone")} dir="ltr" />
            </Field>
            <Field label={t("client.secondPhone")} error={e.secondPhone?.message}>
              <Input {...form.register("secondPhone")} dir="ltr" />
            </Field>
            <Field label={t("common.email")} error={e.email?.message}>
              <Input {...form.register("email")} dir="ltr" />
            </Field>
            <Field label={t("common.city")}>
              <Input {...form.register("city")} />
            </Field>
          </div>
          <Field label={t("common.address")}>
            <Input {...form.register("address")} />
          </Field>
          <Field label={t("common.notes")}>
            <Textarea {...form.register("notes")} />
          </Field>
          <Field label={t("common.status")}>
            <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("common.active")}</SelectItem>
                <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
              </SelectContent>
            </Select>
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
