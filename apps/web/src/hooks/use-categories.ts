"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CategoryCatalog } from "@rothern/shared";
import { api } from "@/lib/api";

/**
 * V2-6 — 4 seviye kategori sistemi (lazy loading, kaynak: Ariba kataloğu).
 *   Level 1 = Segment   (XX000000)
 *   Level 2 = Family    (XXXX0000)
 *   Level 3 = Class     (XXXXXX00)
 *   Level 4 = Commodity (XXXXXXXX)
 *
 * İKİ KATALOG (2026-09-02): `catalog="discovery"` talep/ilan kategorisi,
 * `catalog="full"` (varsayılan) firma "hangi alandasınız" seçimi. Yalnız L4
 * yaprakta ayrışıyorlar (13 yaprak), o yüzden `useCategoryTree` (L1-L2) ve
 * `useRoots` (L1) katalog ALMIYOR — o katmanlar iki katalogda birebir aynı ve
 * tek önbellek girdisi ikisine de yetiyor.
 */
export interface CategoryNode {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  parentId?: string | null;
  segmentLetter?: string | null;
  sortOrder: number;
  /** Backend'den gelen direkt çocuk sayısı (L4 dahil; expand göstergesi). */
  childCount?: number;
  /** Lazy-load için child sayısı (varsa expand butonu). */
  _count?: { children: number };
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
 * Ağacın ÜST katmanı tek fetch: L1 segmentler + L2 aileler (~616 satır /
 * ~90 KB). Segment açıldığında aileler in-memory gelir; sınıf ve emtia
 * `/children` ile açıldıkça inilir.
 *
 * L3 2026-09-01'de bu cevabın DIŞINA çıktı: katalog Ariba dışa aktarımına
 * geçince L1-L3 8.582 satır / 1,43 MB oldu ve modal her açılışta bunu
 * indiriyordu.
 *
 * staleTime 5 dk: kategori güncellemesi max 5 dk'da görünsün.
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

const withCount = (c: CategoryNode): CategoryNode => ({
  ...c,
  _count: { children: c.childCount ?? 0 },
});

/**
 * Level 1 (Segment) listesi.
 *
 * Perf turu (denetim P10 Dalga B): eskiden `/categories/all` (≈8,2k satır /
 * ~180 KB) indirilip level===1 SÜZÜLÜYORDU — yani 38 segment göstermek için
 * tüm ağaç çekiliyordu. Onboarding ve profil kategori seçimi gibi ağaca hiç
 * girilmeyen ekranlarda bu tamamen boşa trafik. Artık `/categories/segments`
 * (yalnız L1). Ağaca gerçekten inen tek yüzey seçim modalı; o drill-down
 * sırasında `useChildren`/`useCategoryTree` ile zaten kendi verisini çekiyor.
 */
export function useRoots() {
  const { data, isLoading, isError, refetch } = useQuery<CategoryNode[]>({
    queryKey: ["category-segments"],
    queryFn: () => api.get("/categories/segments").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * HOUR_MS,
  });
  const mapped = useMemo(() => data?.map(withCount), [data]);
  return { data: mapped, isLoading, isError, refetch };
}

/**
 * Bir parent'ın direkt çocukları.
 * - Parent Segment (L1) → çocukları (L2 aileler) `/all` cache'inde, in-memory.
 * - Parent Family/Class (L2/L3) → çocukları (L3/L4) payload optimizasyonu
 *   gereği cache'te DEĞİL → `/children` ile lazy çekilir (düğüm açılınca
 *   tek istek).
 *
 * `parentLevel` ÇAĞIRANDAN gelir, ağaçtan çıkarılmaz — L3 bir düğüm artık
 * `/all` cevabında olmadığı için `tree.find(parentId)` onu bulamaz ve seviye
 * sessizce yanlış hesaplanırdı (emtia listesi boş dönerdi). Üç çağıran da
 * hangi seviyeyi açtığını zaten biliyor.
 */
export function useChildren(
  parentId: string | null | undefined,
  parentLevel: 1 | 2 | 3,
  catalog: CategoryCatalog = "full",
) {
  const { data: tree, isLoading } = useCategoryTree();
  const lazyNeeded = parentLevel >= 2;

  // L1 parent → aileler in-memory. Katalog süzgeci GEREKMEZ: aileler (L2) iki
  // katalogda birebir aynı; ayrışma yalnız L4'te.
  const memoryChildren = useMemo(() => {
    if (!tree || !parentId || lazyNeeded) return undefined;
    return tree.filter((c) => c.parentId === parentId).map(withCount);
  }, [tree, parentId, lazyNeeded]);

  // L2/L3 parent → sınıf/emtia lazy. `catalog` query anahtarında ŞART: aksi
  // hâlde firma seçiminde açılan bir sınıfın 13 fazla yaprağı, aynı sınıfı
  // talep formunda açan kullanıcıya önbellekten servis edilirdi.
  const lazy = useQuery<CategoryNode[]>({
    queryKey: ["category-children", parentId, catalog],
    queryFn: () =>
      api
        .get("/categories/children", { params: { parentId, catalog } })
        .then((r) => r.data),
    enabled: !!parentId && lazyNeeded,
    staleTime: FIVE_MIN_MS,
    gcTime: HOUR_MS,
  });
  const lazyChildren = useMemo(
    () => lazy.data?.map(withCount),
    [lazy.data],
  );

  if (lazyNeeded) return { data: lazyChildren, isLoading: lazy.isLoading };
  return { data: memoryChildren, isLoading };
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
export function useCategorySearchTree(
  query: string,
  catalog: CategoryCatalog = "full",
) {
  const trimmed = query.trim();
  return useQuery<{ segments: SearchTreeSegment[]; truncated?: boolean }>({
    queryKey: ["category-search-tree", trimmed, catalog],
    queryFn: () =>
      api
        .get("/categories/search-tree", { params: { q: trimmed, catalog } })
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
