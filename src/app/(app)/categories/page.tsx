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
import { categorySchema, type CategoryForm } from "@/lib/schemas";
import {
  listCategories, createCategory, updateCategory, deleteCategory,
} from "@/lib/firebase/services/categories";
import type { Category } from "@/lib/types";

export default function CategoriesPage() {
  return (
    <ScreenGuard screen="categories">
      <CategoriesContent />
    </ScreenGuard>
  );
}

function CategoriesContent() {
  const { t, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const [confirm, setConfirm] = useState<Category | null>(null);

  async function load() {
    setLoading(true);
    setItems(await listCategories());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((c) =>
    `${c.englishName} ${c.arabicName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.categories")}
        actions={
          can("categories", "create") && (
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
                  <TableHead>{t("common.englishName")}</TableHead>
                  <TableHead>{t("common.arabicName")}</TableHead>
                  <TableHead>{t("common.description")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("action.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.englishName}</TableCell>
                    <TableCell>{c.arabicName}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{c.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "success" : "secondary"}>
                        {t(`common.${c.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        {can("categories", "edit") && (
                          <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, editing: c })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {can("categories", "delete") && (
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
          )}
        </CardContent>
      </Card>

      {dialog.open && (
        <CategoryDialog
          editing={dialog.editing}
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
            await deleteCategory(confirm.id, actor);
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

function CategoryDialog({
  editing, onClose, onSaved, actor,
}: {
  editing: Category | null;
  onClose: () => void;
  onSaved: () => void;
  actor: ReturnType<typeof useAuth>["actor"];
}) {
  const { t } = useLang();
  const form = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: editing
      ? { englishName: editing.englishName, arabicName: editing.arabicName, description: editing.description || "", status: editing.status }
      : { englishName: "", arabicName: "", description: "", status: "active" },
  });

  async function onSubmit(data: CategoryForm) {
    try {
      if (editing) {
        await updateCategory(editing.id, data, actor);
        toast({ variant: "success", title: t("msg.updated") });
      } else {
        await createCategory(data, actor);
        toast({ variant: "success", title: t("msg.created") });
      }
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? t("action.edit") : t("action.add")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("common.englishName")} error={form.formState.errors.englishName?.message}>
              <Input {...form.register("englishName")} dir="ltr" />
            </Field>
            <Field label={t("common.arabicName")} error={form.formState.errors.arabicName?.message}>
              <Input {...form.register("arabicName")} dir="rtl" />
            </Field>
          </div>
          <Field label={t("common.description")}>
            <Textarea {...form.register("description")} />
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
