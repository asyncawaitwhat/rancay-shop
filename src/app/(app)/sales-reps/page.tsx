"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
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
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { salesRepSchema, type SalesRepForm } from "@/lib/schemas";
import {
  listSalesReps, createSalesRep, updateSalesRep, deleteSalesRep,
} from "@/lib/firebase/services/salesReps";
import { listUsers } from "@/lib/firebase/services/users";
import type { SalesRep, AppUser } from "@/lib/types";

export default function SalesRepsPage() {
  return (
    <ScreenGuard screen="salesReps">
      <SalesRepsContent />
    </ScreenGuard>
  );
}

function SalesRepsContent() {
  const { t } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [items, setItems] = useState<SalesRep[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; editing: SalesRep | null }>({ open: false, editing: null });
  const [confirm, setConfirm] = useState<SalesRep | null>(null);

  async function load() {
    setLoading(true);
    const [reps, us] = await Promise.all([
      listSalesReps(),
      listUsers().catch(() => [] as AppUser[]),
    ]);
    setItems(reps);
    setUsers(us);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((r) =>
    `${r.englishName} ${r.arabicName} ${r.repCode} ${r.phone || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  function userName(userId?: string) {
    if (!userId) return null;
    return users.find((u) => u.id === userId)?.name || userId;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("salesRep.title")}
        actions={
          can("salesReps", "create") && (
            <Button onClick={() => setDialog({ open: true, editing: null })}>
              <Plus className="h-4 w-4" /> {t("action.add")}
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("salesRep.code")}</TableHead>
                  <TableHead>{t("common.englishName")}</TableHead>
                  <TableHead>{t("common.arabicName")}</TableHead>
                  <TableHead>{t("common.phone")}</TableHead>
                  <TableHead>{t("salesRep.linkedUser")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("action.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.repCode}</TableCell>
                    <TableCell className="font-medium">{r.englishName}</TableCell>
                    <TableCell>{r.arabicName}</TableCell>
                    <TableCell dir="ltr">{r.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {userName(r.userId) || t("salesRep.unlinked")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "active" ? "success" : "secondary"}>
                        {t(`common.${r.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        {can("salesReps", "edit") && (
                          <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, editing: r })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {can("salesReps", "delete") && (
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialog.open && (
        <SalesRepDialog
          editing={dialog.editing}
          users={users}
          onClose={() => setDialog({ open: false, editing: null })}
          onSaved={() => { setDialog({ open: false, editing: null }); load(); }}
          actor={actor}
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
            await deleteSalesRep(confirm.id, actor);
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

function SalesRepDialog({
  editing, users, onClose, onSaved, actor,
}: {
  editing: SalesRep | null;
  users: AppUser[];
  onClose: () => void;
  onSaved: () => void;
  actor: ReturnType<typeof useAuth>["actor"];
}) {
  const { t } = useLang();
  const form = useForm<SalesRepForm>({
    resolver: zodResolver(salesRepSchema),
    defaultValues: editing
      ? {
          englishName: editing.englishName, arabicName: editing.arabicName,
          phone: editing.phone || "", email: editing.email || "",
          userId: editing.userId || "", status: editing.status, notes: editing.notes || "",
        }
      : { englishName: "", arabicName: "", phone: "", email: "", userId: "", status: "active", notes: "" },
  });
  const e = form.formState.errors;
  const NONE = "__none__";

  async function onSubmit(data: SalesRepForm) {
    try {
      if (editing) {
        await updateSalesRep(editing.id, data, actor);
        toast({ variant: "success", title: t("msg.updated") });
      } else {
        await createSalesRep(data, actor);
        toast({ variant: "success", title: t("msg.created") });
      }
      onSaved();
    } catch (err) {
      toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? t("action.edit") : t("action.add")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("common.englishName")} required error={e.englishName?.message}>
              <Input {...form.register("englishName")} dir="ltr" />
            </Field>
            <Field label={t("common.arabicName")} required error={e.arabicName?.message}>
              <Input {...form.register("arabicName")} dir="rtl" />
            </Field>
            <Field label={t("common.phone")}>
              <Input {...form.register("phone")} dir="ltr" />
            </Field>
            <Field label={t("common.email")} error={e.email?.message}>
              <Input {...form.register("email")} dir="ltr" />
            </Field>
          </div>
          <Field label={t("salesRep.linkedUser")} hint={t("salesRep.linkedUserHint")}>
            <Select
              value={form.watch("userId") || NONE}
              onValueChange={(v) => form.setValue("userId", v === NONE ? "" : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("salesRep.unlinked")}</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} — {u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
