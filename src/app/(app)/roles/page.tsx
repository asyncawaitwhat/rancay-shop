"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
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
import { roleSchema, type RoleForm } from "@/lib/schemas";
import { listRoles, createRole, updateRole, deleteRole } from "@/lib/firebase/services/roles";
import { SCREENS, PERMISSION_LEVELS, emptyMatrix } from "@/lib/permissions";
import type { Role, PermissionMatrix, PermissionLevel } from "@/lib/types";

export default function RolesPage() {
  return (
    <ScreenGuard screen="roles">
      <RolesContent />
    </ScreenGuard>
  );
}

function RolesContent() {
  const { t, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [items, setItems] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Role | null }>({ open: false, editing: null });
  const [confirm, setConfirm] = useState<Role | null>(null);

  async function load() {
    setLoading(true);
    setItems(await listRoles());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.roles")}
        actions={can("roles", "create") && (
          <Button onClick={() => setDialog({ open: true, editing: null })}><Plus className="h-4 w-4" /> {t("role.new")}</Button>
        )}
      />
      <Card><CardContent className="p-4">
        {loading ? <LoadingState /> : items.length === 0 ? <EmptyState /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("common.name")}</TableHead><TableHead>{t("common.description")}</TableHead>
              <TableHead></TableHead><TableHead className="text-end">{t("action.actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{name(r.englishName, r.arabicName)}</TableCell>
                <TableCell className="text-muted-foreground">{r.description || "—"}</TableCell>
                <TableCell>{r.isSuperAdmin && <Badge><ShieldCheck className="me-1 h-3 w-3" /> {t("role.superAdmin")}</Badge>}</TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    {can("roles", "edit") && <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, editing: r })}><Pencil className="h-4 w-4" /></Button>}
                    {can("roles", "delete") && !r.isSuperAdmin && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(r)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>

      {dialog.open && <RoleDialog editing={dialog.editing} actor={actor}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={() => { setDialog({ open: false, editing: null }); load(); }} />}

      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={t("action.delete")} description={t("msg.confirmDelete")}
        onConfirm={async () => {
          if (!confirm) return;
          try { await deleteRole(confirm.id, actor); toast({ variant: "success", title: t("msg.deleted") }); setConfirm(null); load(); }
          catch (e) { toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message }); }
        }} />
    </div>
  );
}

function RoleDialog({ editing, actor, onClose, onSaved }: {
  editing: Role | null; actor: ReturnType<typeof useAuth>["actor"]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLang();
  const [matrix, setMatrix] = useState<PermissionMatrix>(editing?.permissions || emptyMatrix());
  const form = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: editing
      ? { englishName: editing.englishName, arabicName: editing.arabicName, description: editing.description || "" }
      : { englishName: "", arabicName: "", description: "" },
  });
  const e = form.formState.errors;
  const isSuper = editing?.isSuperAdmin;

  function setAll(level: PermissionLevel) {
    const m = { ...matrix };
    SCREENS.forEach((s) => { m[s.key] = level; });
    setMatrix(m);
  }

  async function onSubmit(data: RoleForm) {
    try {
      if (editing) { await updateRole(editing.id, data, matrix, actor); toast({ variant: "success", title: t("msg.updated") }); }
      else { await createRole(data, matrix, actor); toast({ variant: "success", title: t("msg.created") }); }
      onSaved();
    } catch (err) { toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message }); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? t("role.edit") : t("role.new")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("common.englishName")} required error={e.englishName?.message}><Input {...form.register("englishName")} dir="ltr" /></Field>
            <Field label={t("common.arabicName")} required error={e.arabicName?.message}><Input {...form.register("arabicName")} dir="rtl" /></Field>
          </div>
          <Field label={t("common.description")}><Textarea {...form.register("description")} /></Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t("role.matrix")}</h3>
              {!isSuper && (
                <div className="flex gap-1">
                  {PERMISSION_LEVELS.map((lvl) => (
                    <Button key={lvl} type="button" variant="outline" size="sm" onClick={() => setAll(lvl)}>{t(`perm.${lvl}`)}</Button>
                  ))}
                </div>
              )}
            </div>
            {isSuper ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{t("role.superAdmin")}: {t("perm.full")}</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>{t("role.screen")}</TableHead><TableHead>{t("role.permissions")}</TableHead></TableRow></TableHeader>
                  <TableBody>{SCREENS.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell className="font-medium">{t(s.labelKey)}</TableCell>
                      <TableCell>
                        <Select value={matrix[s.key]} onValueChange={(v) => setMatrix({ ...matrix, [s.key]: v as PermissionLevel })}>
                          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>{PERMISSION_LEVELS.map((lvl) => <SelectItem key={lvl} value={lvl}>{t(`perm.${lvl}`)}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>{t("action.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
