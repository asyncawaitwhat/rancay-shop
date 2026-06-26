"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Money } from "@/components/shared/money";
import { useLang } from "@/components/providers/language-provider";
import { getProduct, listStockMovements } from "@/lib/firebase/services/products";
import { formatDateTime } from "@/lib/utils";
import type { Product, StockMovement } from "@/lib/types";

export default function ProductProfilePage() {
  return (
    <ScreenGuard screen="products">
      <ProductProfileContent />
    </ScreenGuard>
  );
}

function ProductProfileContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, name } = useLang();
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([getProduct(id), listStockMovements(id)])
      .then(([p, m]) => {
        if (!p) { setError(true); return; }
        setProduct(p);
        setMovements(m);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState />;
  if (error || !product) return <ErrorState />;

  const sales = movements.filter((m) => m.type === "sale");
  const returns = movements.filter((m) => m.type === "return");

  const details: [string, React.ReactNode][] = [
    [t("product.sku"), product.sku],
    [t("product.barcode"), product.barcode || "—"],
    [t("common.category"), name(product.categoryEnglishName, product.categoryArabicName)],
    [t("product.brand"), product.brand || "—"],
    [t("product.clothingType"), product.clothingType || "—"],
    [t("product.color"), product.color || "—"],
    [t("product.size"), product.size || "—"],
    [t("product.unit"), product.unit],
    [t("product.costPrice"), <Money key="c" value={product.costPrice} />],
    [t("product.sellingPrice"), <Money key="s" value={product.sellingPrice} />],
    [t("product.minimumQty"), product.minimumQty],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={name(product.englishName, product.arabicName)}
        description={product.sku}
        actions={
          <Button variant="outline" onClick={() => router.push("/products")}>
            <ArrowLeft className="h-4 w-4" /> {t("action.back")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("product.profile")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
              {product.imageBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageBase64} alt="" className="h-full w-full object-contain" />
              ) : <span className="text-sm text-muted-foreground">{t("product.image")}</span>}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm text-muted-foreground">{t("product.currentQty")}</span>
              <span className={`text-xl font-bold ${product.currentQty <= product.minimumQty ? "text-destructive" : ""}`}>
                {product.currentQty}
              </span>
            </div>
            <dl className="space-y-2 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1.5 last:border-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <dt className="text-muted-foreground">{t("common.status")}</dt>
                <dd><Badge variant={product.status === "active" ? "success" : "secondary"}>{t(`common.${product.status}`)}</Badge></dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="movements">
            <TabsList>
              <TabsTrigger value="movements">{t("product.movements")} ({movements.length})</TabsTrigger>
              <TabsTrigger value="sales">{t("product.salesHistory")} ({sales.length})</TabsTrigger>
              <TabsTrigger value="returns">{t("product.returnHistory")} ({returns.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="movements"><MovementTable rows={movements} /></TabsContent>
            <TabsContent value="sales"><MovementTable rows={sales} /></TabsContent>
            <TabsContent value="returns"><MovementTable rows={returns} /></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function MovementTable({ rows }: { rows: StockMovement[] }) {
  const { t } = useLang();
  return (
    <Card><CardContent className="p-4">
      {rows.length === 0 ? <EmptyState /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("common.date")}</TableHead>
            <TableHead>{t("inv.movementType")}</TableHead>
            <TableHead>{t("common.reference")}</TableHead>
            <TableHead>{t("common.quantity")}</TableHead>
            <TableHead>{t("inv.qtyBefore")}</TableHead>
            <TableHead>{t("inv.qtyAfter")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="text-xs">{formatDateTime(m.createdAt)}</TableCell>
              <TableCell><Badge variant="outline">{t(`trx.${m.type === "sale" ? "expense" : m.type === "return" ? "income" : "adjustment"}`) || m.type}</Badge></TableCell>
              <TableCell className="text-xs">{m.referenceNumber || m.notes || "—"}</TableCell>
              <TableCell className={m.quantity < 0 ? "text-destructive" : "text-green-600"}>
                {m.quantity > 0 ? "+" : ""}{m.quantity}
              </TableCell>
              <TableCell>{m.qtyBefore}</TableCell>
              <TableCell className="font-medium">{m.qtyAfter}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}
