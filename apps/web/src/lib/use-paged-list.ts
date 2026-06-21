"use client";

import { useMemo, useState } from "react";

/**
 * Client-side sayfalama — server pagination dönmeyen düz array listeler için.
 * `Pagination` (components/list) ile uyumlu meta döndürür.
 */
export function usePagedList<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return {
    pageItems,
    page: safePage,
    setPage,
    total,
    totalPages,
    pageSize,
    /** Pagination kontrolü gösterilsin mi (sadece birden fazla sayfa varsa) */
    showPagination: total > pageSize,
  };
}
