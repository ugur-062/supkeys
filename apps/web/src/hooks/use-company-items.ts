"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CatalogItem {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  specification: string | null;
  unit: string;
  unitCode: string | null;
  categoryId: string | null;
  brand: string | null;
  mpn: string | null;
  targetPrice: string | null;
  isActive: boolean;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface CatalogListResult {
  items: CatalogItem[];
  total: number;
  /** Sunucu tavanına dayanıldı mı — sessiz kesme yok. */
  truncated: boolean;
}

export const CATALOG_KEY = ["company-items"] as const;

/** `enabled`: modal kapalıyken ağ isteği atılmasın (perf turu dersi). */
export function useCatalogItems(q: string, enabled = true) {
  return useQuery<CatalogListResult>({
    queryKey: [...CATALOG_KEY, "list", q],
    queryFn: async () => {
      const { data } = await companyApi.get<CatalogListResult>(
        "/company/items",
        { params: q ? { q } : undefined },
      );
      return data;
    },
    enabled,
    // Yazarken önceki sonuçlar ekranda kalsın (skeleton'a flaş atmasın).
    placeholderData: (prev) => prev,
  });
}

/** İhalenin kalemlerini kataloğa al — katalog kendiliğinden dolsun diye. */
export function useImportListingToCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (listingId: string) => {
      const { data } = await companyApi.post<{
        added: number;
        skipped: number;
        truncated: number;
      }>(`/company/items/import-from-listing/${listingId}`);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}

/** Katalogdan sihirbaza eklendi — "sık kullanılan" sıralamasını besler. */
export function useMarkCatalogUsed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await companyApi.post("/company/items/mark-used", { ids });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}
