"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { useLang } from "@/components/providers/language-provider";
import { listAuditLogs } from "@/lib/firebase/services/auditLogs";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog } from "@/lib/types";

export default function AuditPage() {
  return (
    <ScreenGuard screen="audit">
      <AuditContent />
    </ScreenGuard>
  );
}

function AuditContent() {
  const { t } = useLang();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");

  useEffect(() => { listAuditLogs().then(setItems).finally(() => setLoading(false)); }, []);

  const entities = Array.from(new Set(items.map((i) => i.entityType)));
  const filtered = items.filter((l) => {
    const s = `${l.userName} ${l.action} ${l.entityType} ${l.description}`.toLowerCase();
    return s.includes(search.toLowerCase()) && (entityFilter === "all" || l.entityType === entityFilter);
  });
  const { paged, page, setPage, pageCount, total } = usePagination(filtered, 20);

  return (
    <div className="space-y-6">
      <PageHeader title={t("audit.title")} />
      <Card><CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("action.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t("audit.entity")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {entities.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("common.date")}</TableHead><TableHead>{t("audit.user")}</TableHead>
                <TableHead>{t("audit.action")}</TableHead><TableHead>{t("audit.entity")}</TableHead>
                <TableHead>{t("common.description")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{paged.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(l.createdAt)}</TableCell>
                  <TableCell>{l.userName}</TableCell>
                  <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                  <TableCell>{l.entityType}</TableCell>
                  <TableCell className="text-muted-foreground">{l.description}</TableCell>
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
