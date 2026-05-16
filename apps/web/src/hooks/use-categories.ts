"use client";

import { useMemo } from "react";
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

/**
 * V2-6.5 — Tüm aktif kategoriler tek fetch. Modal/segment expand'lerinde
 * yüzlerce paralel /children isteği yerine tek istek (~150KB) + in-memory
 * traverse. parentId üzerinden grupla → useChildren bu cache'ten okur.
 *
 * staleTime 5 dk: tedarikçi yönetim panelinden kategori ekleme/güncelleme
 * yapıldığında alıcı/tedarikçi tarafının max 5dk'da güncel listeyi görsün.
 * refetchOnMount: modal her açıldığında stale olabilirse yeniden çek.
 */
export function useCategoryTree() {
  return useQuery<CategoryNode[]>({
    queryKey: ["category-tree"],
    queryFn: () => api.get("/categories/all").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * HOUR_MS,
    refetchOnMount: true,
  });
}

/**
 * Level 1 (Segment) listesi — modal ilk açılışta. category-tree
 * cache'inden filtre, ek network çağrısı yok.
 */
export function useRoots() {
  const { data: tree, isLoading } = useCategoryTree();
  const data = useMemo(() => {
    if (!tree) return undefined;
    return tree.filter((c) => c.level === 1);
  }, [tree]);
  return { data, isLoading };
}

/**
 * Bir parent'ın direkt çocukları — category-tree cache'inden filtre,
 * ek network çağrısı yok. Eskiden her parentId için ayrı /children
 * fetch idi → birden çok segment açılınca patlama yaşanıyordu.
 */
export function useChildren(parentId: string | null | undefined) {
  const { data: tree, isLoading } = useCategoryTree();
  const data = useMemo(() => {
    if (!tree || !parentId) return undefined;
    return tree.filter((c) => c.parentId === parentId);
  }, [tree, parentId]);
  return { data, isLoading };
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

export interface SearchTreeCommodity {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  isMatch: boolean;
}

export interface SearchTreeClass {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  isMatch: boolean;
  commodities: SearchTreeCommodity[];
}

export interface SearchTreeFamily {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  classes: SearchTreeClass[];
}

export interface SearchTreeSegment {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  segmentLetter: string | null;
  families: SearchTreeFamily[];
}

/**
 * Hiyerarşik arama — eşleşenleri parent path'leri ile tree olarak döner.
 * Modal'da PratisPro tarzı tree render için. Min 2 char (backend enforce).
 */
export function useCategorySearchTree(query: string) {
  const trimmed = query.trim();
  return useQuery<{ segments: SearchTreeSegment[] }>({
    queryKey: ["category-search-tree", trimmed],
    queryFn: () =>
      api
        .get("/categories/search-tree", { params: { q: trimmed } })
        .then((r) => r.data),
    enabled: trimmed.length >= 2,
    staleTime: FIVE_MIN_MS,
  });
}

/**
 * Seçili ID'lerin breadcrumb bilgisi (chip listesi için).
 *
 * V2-6.5 fix — Hızlı seçim ekleme/çıkarmada chip listesinde loading flicker
 * ve uzun süreli "yükleniyor" hissini önlemek için:
 *   - placeholderData: önceki cevap korunur, yeni fetch arka planda
 *   - gcTime: HOUR_MS — cache entry'leri çabuk düşmesin
 */
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
    gcTime: HOUR_MS,
    placeholderData: (prev) => prev,
  });
}
