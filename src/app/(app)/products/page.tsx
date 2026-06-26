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
import { ImageUpload } from "@/components/shared/image-upload";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { productSchema, type ProductForm } from "@/lib/schemas";
import {
  listProducts, createProduct, updateProduct, deleteProduct, generateSku,
} from "@/lib/firebase/services/products";
import { listCategories } from "@/lib/firebase/services/categories";
import type { Product, Category } from "@/lib/types";

export default function ProductsPage() {
  return (
    <ScreenGuard screen="products">
      <ProductsContent />
    </ScreenGuard>
  );
}

function ProductsContent() {
  const { t, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [dialog, setDialog] = useState<{ open: boolean; editing: Product | null }>({ open: false, editing: null });
  const [confirm, setConfirm] = useState<Product | null>(null);

  async function load() {
    setLoading(true);
    const [p, c] = await Promise.all([listProducts(), listCategories()]);
    setItems(p);
    setCategories(c);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((p) => {
    const s = `${p.englishName} ${p.arabicName} ${p.sku} ${p.barcode || ""}`.toLowerCase();
    return s.includes(search.toLowerCase()) && (catFilter === "all" || p.categoryId === catFilter);
  });
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.products")}
        actions={can("products", "create") && (
          <Button onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="h-4 w-4" /> {t("product.new")}
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
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder={t("common.category")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{name(c.englishName, c.arabicName)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14"></TableHead>
                    <TableHead>{t("product.sku")}</TableHead>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.category")}</TableHead>
                    <TableHead>{t("product.sellingPrice")}</TableHead>
                    <TableHead>{t("product.currentQty")}</TableHead>
                    <TableHead className="text-end">{t("action.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="h-10 w-10 overflow-hidden rounded-md bg-muted">
                          {p.imageBase64 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageBase64} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p.englishName}</div>
                        <div className="text-xs text-muted-foreground" dir="rtl">{p.arabicName}</div>
                      </TableCell>
                      <TableCell>{name(p.categoryEnglishName, p.categoryArabicName)}</TableCell>
                      <TableCell><Money value={p.sellingPrice} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {p.currentQty}
                          {p.currentQty <= p.minimumQty && <Badge variant="warning">{t("product.lowStockBadge")}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon">
                            <Link href={`/products/${p.id}`}><Eye className="h-4 w-4" /></Link>
                          </Button>
                          {can("products", "edit") && (
                            <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, editing: p })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {can("products", "delete") && (
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm(p)}>
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
        <ProductDialog
          editing={dialog.editing}
          categories={categories}
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
            await deleteProduct(confirm.id, actor);
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

function ProductDialog({
  editing, categories, actor, onClose, onSaved,
}: {
  editing: Product | null;
  categories: Category[];
  actor: ReturnType<typeof useAuth>["actor"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, name } = useLang();
  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: editing
      ? {
          sku: editing.sku, barcode: editing.barcode || "", englishName: editing.englishName, arabicName: editing.arabicName,
          categoryId: editing.categoryId, brand: editing.brand || "", clothingType: editing.clothingType || "",
          color: editing.color || "", size: editing.size || "", unit: editing.unit, costPrice: editing.costPrice,
          sellingPrice: editing.sellingPrice, currentQty: editing.currentQty, minimumQty: editing.minimumQty,
          imageBase64: editing.imageBase64 || "", status: editing.status, notes: editing.notes || "",
        }
      : {
          sku: "", barcode: "", englishName: "", arabicName: "", categoryId: "", brand: "", clothingType: "",
          color: "", size: "", unit: "piece", costPrice: 0, sellingPrice: 0, currentQty: 0, minimumQty: 0,
          imageBase64: "", status: "active", notes: "",
        },
  });
  const e = form.formState.errors;

  // Auto-generate SKU for new products.
  useEffect(() => {
    if (!editing) generateSku().then((sku) => form.setValue("sku", sku)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(data: ProductForm) {
    try {
      if (editing) {
        await updateProduct(editing.id, data, categories, actor);
        toast({ variant: "success", title: t("msg.updated") });
      } else {
        await createProduct(data, categories, actor);
        toast({ variant: "success", title: t("msg.created") });
      }
      onSaved();
    } catch (err) {
      toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? t("product.edit") : t("product.new")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ImageUpload value={form.watch("imageBase64")} onChange={(v) => form.setValue("imageBase64", v)} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("product.sku")} required error={e.sku?.message}>
              <Input {...form.register("sku")} dir="ltr" />
            </Field>
            <Field label={t("product.barcode")}>
              <Input {...form.register("barcode")} dir="ltr" />
            </Field>
            <Field label={t("common.category")} required error={e.categoryId?.message}>
              <Select value={form.watch("categoryId")} onValueChange={(v) => form.setValue("categoryId", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder={t("action.select")} /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{name(c.englishName, c.arabicName)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("common.englishName")} required error={e.englishName?.message}>
              <Input {...form.register("englishName")} dir="ltr" />
            </Field>
            <Field label={t("common.arabicName")} required error={e.arabicName?.message}>
              <Input {...form.register("arabicName")} dir="rtl" />
            </Field>
            <Field label={t("product.brand")}><Input {...form.register("brand")} /></Field>
            <Field label={t("product.clothingType")}><Input {...form.register("clothingType")} /></Field>
            <Field label={t("product.color")}><Input {...form.register("color")} /></Field>
            <Field label={t("product.size")}><Input {...form.register("size")} /></Field>
            <Field label={t("product.unit")} required error={e.unit?.message}><Input {...form.register("unit")} /></Field>
            <Field label={t("product.costPrice")} required error={e.costPrice?.message}>
              <Input type="number" step="0.01" {...form.register("costPrice")} dir="ltr" />
            </Field>
            <Field label={t("product.sellingPrice")} required error={e.sellingPrice?.message}>
              <Input type="number" step="0.01" {...form.register("sellingPrice")} dir="ltr" />
            </Field>
            <Field label={t("product.currentQty")} required error={e.currentQty?.message}>
              <Input type="number" {...form.register("currentQty")} dir="ltr" disabled={!!editing} />
            </Field>
            <Field label={t("product.minimumQty")} required error={e.minimumQty?.message}>
              <Input type="number" {...form.register("minimumQty")} dir="ltr" />
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
          </div>
          {editing && <p className="text-xs text-muted-foreground">{t("product.currentQty")}: {t("inv.adjust")} → {t("nav.inventory")}</p>}
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
