"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers/language-provider";

/** Client-side pagination hook over an already-loaded/filtered array. */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const paged = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize]
  );
  return { page: current, setPage, pageCount, paged, total: items.length };
}

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { t } = useLang();
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
      <span>
        {total} {t("common.rows")}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>
          {t("common.page")} {page} {t("common.of")} {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
