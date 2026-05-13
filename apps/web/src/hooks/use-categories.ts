"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * V2-6 — 4 seviye UNSPSC kategori sistemi (lazy loading).
 *   Level 1 = Segment   (XX000000)
 *   Level 2 = Family    (XXXX0000)
 *   Level 3 = Class     (XXXXXX00)
 *   Level 4 = Commodity (XXXXXXXX)
 *
 * Sadece Level 3 + 4 seçilebilir. Level 1 + 2 accordion grup başlığıdır.
 */
export interface CategoryNode {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  parentId?: string | null;
  segmentLetter?: string | null;
  sortOrder: number;
  /** Lazy-load için child sayısı (varsa expand butonu). */
  _count?: { children: number };
}

export interface CategorySearchResult {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  parentId?: string | null;
  breadcrumb: string;
}

export interface CategoryWithBreadcrumb {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  breadcrumb: string;
}

const HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/** Level 1 (Segment) listesi — modal ilk açılışta tek istek. */
export function useRoots() {
  return useQuery<CategoryNode[]>({
    queryKey: ["category-roots"],
    queryFn: () => api.get("/categories/roots").then((r) => r.data),
    staleTime: HOUR_MS,
    gcTime: 24 * HOUR_MS,
  });
}

/** Bir parent'ın direkt çocukları — lazy expand. Enabled sadece parentId varsa. */
export function useChildren(parentId: string | null | undefined) {
  return useQuery<CategoryNode[]>({
    queryKey: ["category-children", parentId],
    queryFn: () =>
      api
        .get("/categories/children", { params: { parentId } })
        .then((r) => r.data),
    enabled: Boolean(parentId),
    staleTime: HOUR_MS,
    gcTime: 24 * HOUR_MS,
  });
}

/** Class+Commodity arama (min 2 char). Backend zaten min-char enforce eder. */
export function useCategorySearch(query: string) {
  const trimmed = query.trim();
  return useQuery<CategorySearchResult[]>({
    queryKey: ["category-search", trimmed],
    queryFn: () =>
      api
        .get("/categories/search", { params: { q: trimmed } })
        .then((r) => r.data),
    enabled: trimmed.length >= 2,
    staleTime: FIVE_MIN_MS,
  });
}

/** Seçili ID'lerin breadcrumb bilgisi (chip listesi için). */
export function useCategoriesByIds(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery<CategoryWithBreadcrumb[]>({
    queryKey: ["category-by-ids", key],
    queryFn: () => {
      if (ids.length === 0) return Promise.resolve([]);
      return api
        .get("/categories/by-ids", { params: { ids: ids.join(",") } })
        .then((r) => r.data);
    },
    enabled: ids.length > 0,
    staleTime: FIVE_MIN_MS,
  });
}
