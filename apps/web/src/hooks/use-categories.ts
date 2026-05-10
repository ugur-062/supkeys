"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface CategoryNode {
  id: string;
  code: string;
  nameTr: string;
  nameEn: string;
  level: number;
  parentId?: string | null;
  segmentLetter?: string | null;
  sortOrder: number;
  children?: CategoryNode[];
}

export interface CategorySearchResult {
  id: string;
  code: string;
  nameTr: string;
  nameEn: string;
  level: number;
  parentId?: string | null;
  breadcrumb: string;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * V2-6 — UNSPSC kategori ağacı. Tüm 8 segment + 392 family tek istekte gelir.
 * Public endpoint — auth gerekmez. Browser'da 1 saat cache (Cache-Control header).
 */
export function useCategoryTree() {
  return useQuery<CategoryNode[]>({
    queryKey: ["category-tree"],
    queryFn: () => api.get("/categories").then((r) => r.data),
    staleTime: HOUR_MS,
    gcTime: 24 * HOUR_MS,
  });
}

/**
 * V2-6 — Family seviyesi arama. Min 2 char zorunluluğu hook seviyesinde
 * `enabled` ile sağlanır; backend zaten boş array döndürür.
 */
export function useCategorySearch(query: string) {
  const trimmed = query.trim();
  return useQuery<CategorySearchResult[]>({
    queryKey: ["category-search", trimmed],
    queryFn: () =>
      api
        .get("/categories/search", { params: { q: trimmed } })
        .then((r) => r.data),
    enabled: trimmed.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
