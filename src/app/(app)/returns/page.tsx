"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Money } from "@/components/shared/money";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { useLang } from "@/components/providers/language-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { listReturnInvoices } from "@/lib/firebase/services/returns";
import { formatDate } from "@/lib/utils";
import type { ReturnInvoice } from "@/lib/types";

export default function ReturnsPage() {
  return (
    <ScreenGuard screen="returns">
      <ReturnsContent />
    </ScreenGuard>
  );
}

function ReturnsContent() {
  const { t, name } = useLang();
  const { can } = usePermissions();
  const [items, setItems] = useState<ReturnInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { listReturnInvoices().then(setItems).finally(() => setLoading(false)); }, []);

  const filtered = items.filter((i) =>
    `${i.invoiceNumber} ${i.clientEnglishName} ${i.clientArabicName}`.toLowerCase().includes(search.toLowerCase())
  );
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.returns")}
        actions={can("returns", "create") && (
          <Button asChild><Link href="/returns/new"><Plus className="h-4 w-4" /> {t("return.new")}</Link></Button>
        )}
      />
      <Card><CardContent className="p-4">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("return.number")}</TableHead><TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.client")}</TableHead><TableHead>{t("invoice.grandTotal")}</TableHead>
                <TableHead>{t("invoice.status")}</TableHead><TableHead className="text-end">{t("action.actions")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{paged.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell>
                  <TableCell>{formatDate(i.invoiceDate)}</TableCell>
                  <TableCell>{name(i.clientEnglishName, i.clientArabicName)}</TableCell>
                  <TableCell><Money value={i.grandTotal} /></TableCell>
                  <TableCell><Badge variant={i.status === "posted" ? "success" : i.status === "cancelled" ? "destructive" : "secondary"}>{t(`invoice.${i.status}`)}</Badge></TableCell>
                  <TableCell className="text-end">
                    <Button asChild variant="ghost" size="icon"><Link href={`/returns/${i.id}`}><Eye className="h-4 w-4" /></Link></Button>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
