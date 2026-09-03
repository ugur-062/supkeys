"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";
import type { SellerTenderRow } from "./use-seller-tenders";

/**
 * PANO KEŞİF BLOĞU — veri katmanı.
 *
 * Panelin KENDİ auth'lu uçlarını kullanır; pazar yerinin herkese açık uçları
 * BURADA KULLANILMAZ. Sebep üç katlı: (1) `MARKETPLACE_LIVE` kapalıyken boş
 * dönerler, (2) maskeleme/davet/bağlantı görünürlüğünü taşımazlar,
 * (3) panelin göreceği içeriğin bir kısmı (bağlantıya özel ilanlar) orada
 * hiç yok.
 */

/** Sektör kutusu — segment başına açık ilan sayısı. */
export interface DiscoverFacets {
  segments: { id: string; name: string; count: number }[];
  total: number;
}

export interface DiscoverProduct {
  slug: string;
  name: string;
  excerpt: string | null;
  images: string[];
  unit: string;
  categoryId: string | null;
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount: string | null;
  priceTiers: { minQty: number; unitPrice: number }[] | null;
  priceCurrency: string;
  moq: string | null;
  company: { name: string; slug: string; city: string | null };
}

/**
 * Şeritteki ilanlar. `limit` sunucuda SIRALAMADAN SONRA uygulanır — "en uygun
 * 6", "rastgele 6" değil.
 */
export function useDiscoverListings(type: "ALIM" | "SATIS", limit = 6) {
  return useQuery<SellerTenderRow[]>({
    queryKey: ["company-listings", "discover", type, limit],
    queryFn: async () => {
      // `openOnly=1`: şerit FIRSAT vaat ediyor — kapanmış (AWARDED /
      // CLOSED_NO_AWARD) ilan oraya girmemeli. Yanındaki sektör sayaçları
      // zaten yalnız açıkları sayıyor; bayraksızken "kutularda 0, şeritte
      // 6 kart" çelişkisi çıkıyordu.
      const { data } = await companyApi.get<SellerTenderRow[]>(
        `/company/listings/seller-tenders?type=${type}&limit=${limit}&openOnly=1`,
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useDiscoverFacets(type: "ALIM" | "SATIS") {
  return useQuery<DiscoverFacets>({
    queryKey: ["company-listings", "discover-facets", type],
    queryFn: async () => {
      const { data } = await companyApi.get<DiscoverFacets>(
        `/company/listings/discover-facets?type=${type}`,
      );
      return data;
    },
    // Sayaçlar listeden seyrek değişir; her pano açılışında yeniden sormaya
    // gerek yok.
    staleTime: 120_000,
  });
}

export function useDiscoverProducts(
  params: { q?: string; category?: string; limit?: number } = {},
  enabled = true,
) {
  return useQuery<DiscoverProduct[]>({
    queryKey: ["company-items", "discover", params],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.q) sp.set("q", params.q);
      if (params.category) sp.set("category", params.category);
      if (params.limit) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      const { data } = await companyApi.get<DiscoverProduct[]>(
        `/company/items/discover${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled,
    staleTime: 60_000,
  });
}
