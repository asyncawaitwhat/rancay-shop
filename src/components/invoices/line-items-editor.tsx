"use client";

import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { useLang } from "@/components/providers/language-provider";
import { computeLine } from "@/lib/invoice-math";
import { formatMoney } from "@/lib/utils";
import type { Product, DiscountType } from "@/lib/types";
import type { RawLine } from "@/lib/invoice-math";

/**
 * Editable invoice/return line items. Products are added ONLY via the searchable
 * combobox (no free text). Quantity is typed; price is pre-filled from the
 * product but editable. Optional per-line stock warnings for sales.
 */
export function LineItemsEditor({
  products,
  lines,
  onChange,
  checkStock,
}: {
  products: Product[];
  lines: RawLine[];
  onChange: (lines: RawLine[]) => void;
  checkStock?: boolean;
}) {
  const { t, name } = useLang();

  function addProduct(productId: string) {
    if (lines.some((l) => l.productId === productId)) return;
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    onChange([
      ...lines,
      {
        productId: p.id,
        productSku: p.sku,
        productEnglishName: p.englishName,
        productArabicName: p.arabicName,
        quantity: 1,
        price: p.sellingPrice,
        discountType: "amount",
        discountValue: 0,
      },
    ]);
  }

  function update(index: number, patch: Partial<RawLine>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function remove(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  const available = products.filter((p) => p.status === "active");

  return (
    <div className="space-y-3">
      <div className="max-w-md">
        <EntityCombobox
          items={available.map((p) => ({
            id: p.id,
            label: name(p.englishName, p.arabicName),
            sublabel: `${p.sku} • ${t("invoice.inStock")}: ${p.currentQty} • ${formatMoney(p.sellingPrice)}`,
            keywords: `${p.sku} ${p.barcode || ""}`,
            disabled: lines.some((l) => l.productId === p.id),
          }))}
          value=""
          onSelect={addProduct}
          placeholder={t("invoice.addItems")}
        />
      </div>

      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Plus className="mx-auto mb-2 h-5 w-5" />
          {t("invoice.noItems")}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">{t("common.product")}</TableHead>
                <TableHead className="w-24">{t("common.quantity")}</TableHead>
                <TableHead className="w-28">{t("common.price")}</TableHead>
                <TableHead className="w-40">{t("common.discount")}</TableHead>
                <TableHead className="w-28 text-end">{t("invoice.lineTotal")}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => {
                const computed = computeLine(line);
                const product = products.find((p) => p.id === line.productId);
                const insufficient = checkStock && product && line.quantity > product.currentQty;
                return (
                  <TableRow key={line.productId}>
                    <TableCell>
                      <div className="font-medium">{name(line.productEnglishName, line.productArabicName)}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.productSku}
                        {checkStock && product && (
                          <span className="ms-2">{t("invoice.inStock")}: {product.currentQty}</span>
                        )}
                      </div>
                      {insufficient && <Badge variant="destructive" className="mt-1">{t("invoice.insufficientStock")}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={1} dir="ltr" className="h-9"
                        value={line.quantity}
                        onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01" min={0} dir="ltr" className="h-9"
                        value={line.price}
                        onChange={(e) => update(i, { price: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Input
                          type="number" step="0.01" min={0} dir="ltr" className="h-9 w-16"
                          value={line.discountValue}
                          onChange={(e) => update(i, { discountValue: Number(e.target.value) })}
                        />
                        <Select value={line.discountType} onValueChange={(v) => update(i, { discountType: v as DiscountType })}>
                          <SelectTrigger className="h-9 w-16"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amount">#</SelectItem>
                            <SelectItem value="percentage">%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-medium">{formatMoney(computed.lineTotal)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
