"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sliders, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Field } from "@/components/shared/field";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { stockAdjustmentSchema, type StockAdjustmentForm } from "@/lib/schemas";
import { listProducts, listStockMovements, adjustStock } from "@/lib/firebase/services/products";
import { formatDateTime } from "@/lib/utils";
import type { Product, StockMovement } from "@/lib/types";

export default function InventoryPage() {
  return (
    <ScreenGuard screen="inventory">
      <InventoryContent />
    </ScreenGuard>
  );
}

function InventoryContent() {
  const { t, name } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const [p, m] = await Promise.all([listProducts(), listStockMovements()]);
    setProducts(p);
    setMovements(m);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const lowStock = products.filter((p) => p.currentQty <= p.minimumQty);
  const filteredMovements = movements.filter((m) =>
    `${m.productEnglishName} ${m.productArabicName} ${m.productSku} ${m.referenceNumber || ""}`
      .toLowerCase().includes(search.toLowerCase())
  );
  const { paged, page, setPage, pageCount, total } = usePagination(filteredMovements, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.inventory")}
        actions={can("inventory", "create") && (
          <Button onClick={() => setAdjustOpen(true)}>
            <Sliders className="h-4 w-4" /> {t("inv.adjust")}
          </Button>
        )}
      />

      {loading ? <LoadingState /> : (
        <Tabs defaultValue="ledger">
          <TabsList>
            <TabsTrigger value="ledger">{t("inv.movementLedger")}</TabsTrigger>
            <TabsTrigger value="low">{t("inv.lowStock")} ({lowStock.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger">
            <Card><CardContent className="p-4">
              <div className="relative mb-4 max-w-sm">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {filteredMovements.length === 0 ? <EmptyState /> : (
                <>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("common.product")}</TableHead>
                      <TableHead>{t("inv.movementType")}</TableHead>
                      <TableHead>{t("common.reference")}</TableHead>
                      <TableHead>{t("common.quantity")}</TableHead>
                      <TableHead>{t("inv.qtyAfter")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{paged.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs">{formatDateTime(m.createdAt)}</TableCell>
                        <TableCell>{name(m.productEnglishName, m.productArabicName)}</TableCell>
                        <TableCell><Badge variant="outline">{m.type}</Badge></TableCell>
                        <TableCell className="text-xs">{m.referenceNumber || m.notes || "—"}</TableCell>
                        <TableCell className={m.quantity < 0 ? "text-destructive" : "text-green-600"}>
                          {m.quantity > 0 ? "+" : ""}{m.quantity}
                        </TableCell>
                        <TableCell className="font-medium">{m.qtyAfter}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                  <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
                </>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="low">
            <Card><CardContent className="p-4">
              {lowStock.length === 0 ? <EmptyState title={t("common.noData")} /> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{t("product.sku")}</TableHead>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("product.currentQty")}</TableHead>
                    <TableHead>{t("product.minimumQty")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{lowStock.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell><Link href={`/products/${p.id}`} className="text-primary hover:underline">{name(p.englishName, p.arabicName)}</Link></TableCell>
                      <TableCell><Badge variant="destructive">{p.currentQty}</Badge></TableCell>
                      <TableCell>{p.minimumQty}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}

      {adjustOpen && (
        <AdjustDialog
          products={products}
          actor={actor}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => { setAdjustOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  products, actor, onClose, onSaved,
}: {
  products: Product[];
  actor: ReturnType<typeof useAuth>["actor"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, name } = useLang();
  const form = useForm<StockAdjustmentForm>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: { productId: "", type: "increase", quantity: 0, notes: "" },
  });
  const selected = products.find((p) => p.id === form.watch("productId"));
  const e = form.formState.errors;

  async function onSubmit(data: StockAdjustmentForm) {
    try {
      await adjustStock(data, actor);
      toast({ variant: "success", title: t("msg.saved") });
      onSaved();
    } catch (err) {
      toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("inv.adjustment")}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label={t("common.product")} required error={e.productId?.message}>
            <EntityCombobox
              items={products.map((p) => ({
                id: p.id, label: name(p.englishName, p.arabicName), sublabel: `${p.sku} • ${t("invoice.inStock")}: ${p.currentQty}`, keywords: p.sku,
              }))}
              value={form.watch("productId")}
              onSelect={(id) => form.setValue("productId", id, { shouldValidate: true })}
              placeholder={t("invoice.selectProduct")}
            />
          </Field>
          {selected && (
            <p className="text-sm text-muted-foreground">{t("product.currentQty")}: <span className="font-bold text-foreground">{selected.currentQty}</span></p>
          )}
          <Field label={t("common.type")}>
            <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as "set" | "increase" | "decrease")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">{t("inv.increase")}</SelectItem>
                <SelectItem value="decrease">{t("inv.decrease")}</SelectItem>
                <SelectItem value="set">{t("inv.set")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("common.quantity")} required error={e.quantity?.message}>
            <Input type="number" {...form.register("quantity")} dir="ltr" />
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
