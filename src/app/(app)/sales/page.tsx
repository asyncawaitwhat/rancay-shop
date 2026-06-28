"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Money } from "@/components/shared/money";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { useLang } from "@/components/providers/language-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { listSalesInvoices } from "@/lib/firebase/services/invoices";
import { listSalesReps } from "@/lib/firebase/services/salesReps";
import { formatDate } from "@/lib/utils";
import type { SalesInvoice, SalesRep } from "@/lib/types";

export default function SalesPage() {
  return (
    <ScreenGuard screen="sales">
      <SalesContent />
    </ScreenGuard>
  );
}

function SalesContent() {
  const { t, name } = useLang();
  const { can } = usePermissions();
  const { user, role } = useAuth();
  const [items, setItems] = useState<SalesInvoice[]>([]);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");

  useEffect(() => {
    Promise.all([listSalesInvoices(), listSalesReps().catch(() => [] as SalesRep[])])
      .then(([inv, r]) => { setItems(inv); setReps(r); })
      .finally(() => setLoading(false));
  }, []);

  // If the logged-in user IS a sales rep (a rep record is linked to their user)
  // and they are not a super admin, they only ever see their own invoices.
  const myRep = user ? reps.find((r) => r.userId === user.id) : undefined;
  const restrictedToRep = myRep && !role?.isSuperAdmin ? myRep.id : null;

  const filtered = items.filter((i) => {
    const s = `${i.invoiceNumber} ${i.clientEnglishName} ${i.clientArabicName}`.toLowerCase();
    if (!s.includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (restrictedToRep) return i.salesRepId === restrictedToRep;
    if (repFilter !== "all") {
      return repFilter === "none" ? !i.salesRepId : i.salesRepId === repFilter;
    }
    return true;
  });
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.sales")}
        actions={can("sales", "create") && (
          <Button asChild><Link href="/sales/new"><Plus className="h-4 w-4" /> {t("invoice.new")}</Link></Button>
        )}
      />
      <Card><CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="draft">{t("invoice.draft")}</SelectItem>
              <SelectItem value="posted">{t("invoice.posted")}</SelectItem>
              <SelectItem value="cancelled">{t("invoice.cancelled")}</SelectItem>
            </SelectContent>
          </Select>
          {!restrictedToRep && reps.length > 0 && (
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder={t("invoice.salesRep")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("invoice.salesRep")}: {t("common.all")}</SelectItem>
                <SelectItem value="none">{t("salesRep.none")}</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{name(r.englishName, r.arabicName)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {restrictedToRep && (
            <Badge variant="secondary">{t("invoice.myInvoicesOnly")}</Badge>
          )}
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("invoice.number")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.client")}</TableHead>
                <TableHead>{t("invoice.salesRep")}</TableHead>
                <TableHead>{t("invoice.grandTotal")}</TableHead>
                <TableHead>{t("invoice.paymentStatus")}</TableHead>
                <TableHead>{t("invoice.status")}</TableHead>
                <TableHead className="text-end">{t("action.actions")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{paged.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell>
                  <TableCell>{formatDate(i.invoiceDate)}</TableCell>
                  <TableCell>{name(i.clientEnglishName, i.clientArabicName)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {i.salesRepId ? name(i.salesRepEnglishName || "", i.salesRepArabicName || "") : "—"}
                  </TableCell>
                  <TableCell><Money value={i.grandTotal} /></TableCell>
                  <TableCell><Badge variant={i.paymentStatus === "paid" ? "success" : i.paymentStatus === "partial" ? "warning" : "secondary"}>{t(`invoice.${i.paymentStatus}`)}</Badge></TableCell>
                  <TableCell><Badge variant={i.status === "posted" ? "success" : i.status === "cancelled" ? "destructive" : "secondary"}>{t(`invoice.${i.status}`)}</Badge></TableCell>
                  <TableCell className="text-end">
                    <Button asChild variant="ghost" size="icon"><Link href={`/sales/${i.id}`}><Eye className="h-4 w-4" /></Link></Button>
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
