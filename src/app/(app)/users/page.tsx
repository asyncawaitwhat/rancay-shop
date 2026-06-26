"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { ImageUpload } from "@/components/shared/image-upload";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { userSchema, userCreateSchema, type UserForm, type UserCreateForm } from "@/lib/schemas";
import { listUsers, createUser, updateUser, deleteUser } from "@/lib/firebase/services/users";
import { listRoles } from "@/lib/firebase/services/roles";
import type { AppUser, Role } from "@/lib/types";

export default function UsersPage() {
  return (
    <ScreenGuard screen="users">
      <UsersContent />
    </ScreenGuard>
  );
}

function UsersContent() {
  const { t, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [items, setItems] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; editing: AppUser | null }>({ open: false, editing: null });
  const [confirm, setConfirm] = useState<AppUser | null>(null);

  async function load() {
    setLoading(true);
    const [u, r] = await Promise.all([listUsers(), listRoles()]);
    setItems(u); setRoles(r); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const roleName = (id: string) => {
    const r = roles.find((x) => x.id === id);
    return r ? name(r.englishName, r.arabicName) : id;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.users")}
        actions={can("users", "create") && (
          <Button onClick={() => setDialog({ open: true, editing: null })}><Plus className="h-4 w-4" /> {t("user.new")}</Button>
        )}
      />
      <Card><CardContent className="p-4">
        {loading ? <LoadingState /> : items.length === 0 ? <EmptyState /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead></TableHead><TableHead>{t("user.name")}</TableHead>
              <TableHead>{t("common.email")}</TableHead><TableHead>{t("user.role")}</TableHead>
              <TableHead>{t("common.status")}</TableHead><TableHead className="text-end">{t("action.actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Avatar className="h-9 w-9">
                    {u.avatarBase64 ? <AvatarImage src={u.avatarBase64} /> : null}
                    <AvatarFallback>{u.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell dir="ltr">{u.email}</TableCell>
                <TableCell>{roleName(u.role)}</TableCell>
                <TableCell><Badge variant={u.status === "active" ? "success" : "secondary"}>{t(`common.${u.status}`)}</Badge></TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    {can("users", "edit") && <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, editing: u })}><Pencil className="h-4 w-4" /></Button>}
                    {can("users", "delete") && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(u)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>

      {dialog.open && <UserDialog editing={dialog.editing} roles={roles} actor={actor}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={() => { setDialog({ open: false, editing: null }); load(); }} />}

      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={t("action.delete")} description={t("msg.confirmDelete")}
        onConfirm={async () => {
          if (!confirm) return;
          try { await deleteUser(confirm.id, actor); toast({ variant: "success", title: t("msg.deleted") }); setConfirm(null); load(); }
          catch (e) { toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message }); }
        }} />
    </div>
  );
}

function UserDialog({ editing, roles, actor, onClose, onSaved }: {
  editing: AppUser | null; roles: Role[]; actor: ReturnType<typeof useAuth>["actor"]; onClose: () => void; onSaved: () => void;
}) {
  const { t, name } = useLang();
  const isEdit = !!editing;
  const form = useForm<UserCreateForm>({
    resolver: zodResolver(isEdit ? userSchema : userCreateSchema) as never,
    defaultValues: editing
      ? { name: editing.name, email: editing.email, role: editing.role, status: editing.status, language: editing.language, avatarBase64: editing.avatarBase64 || "", password: "" }
      : { name: "", email: "", role: "", status: "active", language: "en", avatarBase64: "", password: "" },
  });
  const e = form.formState.errors;

  async function onSubmit(data: UserCreateForm) {
    try {
      if (editing) {
        const { password: _p, ...rest } = data;
        void _p;
        await updateUser(editing.id, rest as UserForm, actor);
        toast({ variant: "success", title: t("msg.updated") });
      } else {
        await createUser(data, actor);
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
        <DialogHeader><DialogTitle>{editing ? t("user.edit") : t("user.new")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ImageUpload rounded value={form.watch("avatarBase64")} onChange={(v) => form.setValue("avatarBase64", v)} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("user.name")} required error={e.name?.message}><Input {...form.register("name")} /></Field>
            <Field label={t("common.email")} required error={e.email?.message}><Input {...form.register("email")} dir="ltr" disabled={isEdit} /></Field>
            {!isEdit && (
              <Field label={t("user.password")} required error={e.password?.message}><Input type="password" {...form.register("password")} dir="ltr" /></Field>
            )}
            <Field label={t("user.role")} required error={e.role?.message}>
              <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder={t("action.select")} /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{name(r.englishName, r.arabicName)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t("common.language")}>
              <Select value={form.watch("language")} onValueChange={(v) => form.setValue("language", v as "ar" | "en")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="en">{t("common.english")}</SelectItem><SelectItem value="ar">{t("common.arabic")}</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label={t("common.status")}>
              <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as "active" | "inactive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">{t("common.active")}</SelectItem><SelectItem value="inactive">{t("common.inactive")}</SelectItem></SelectContent>
              </Select>
            </Field>
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
