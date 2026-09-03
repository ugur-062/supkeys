"use client";

import { companyApi } from "@/lib/company-auth/api";
import type {
  PublicProduct,
  PublicProductCompany,
} from "@/lib/public/marketplace-api";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
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
 *
 * `openOnly=true` ZORUNLU: uç varsayılan olarak açık ilanların YANINDA benim
 * katıldığım kapanmış ilanları da döndürür (liste sayfası ikisini Aktif/Geçmiş
 * sekmesiyle ayırır). Şerit ise "teklif bekleyen" diye başlıklanıyor; süzgeç
 * olmadan açık ilan bitince şerit sessizce kapanmış/karara bağlanmış
 * kayıtlarla dolar ve "Tümünü gör" tıklandığında liste 0 sonuç gösterir.
 * Süzgeci istemcide yapmak da yanlış olurdu: `limit` sunucuda uygulandığı
 * için elemeden sonra 6 yerine 2 kart kalırdı.
 */
export function useDiscoverListings(type: "ALIM" | "SATIS", limit = 6) {
  return useQuery<SellerTenderRow[]>({
    queryKey: ["company-listings", "discover", type, limit],
    queryFn: async () => {
      const { data } = await companyApi.get<SellerTenderRow[]>(
        `/company/listings/seller-tenders?type=${type}&limit=${limit}&openOnly=true`,
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

/**
 * PANEL içi tekil ürün. Herkese açık uçtan okur — ve bu, "pazar yerinin
 * herkese açık uçları panelde KULLANILMAZ" kuralının bilinçli istisnasıdır.
 *
 * O kuralın üç gerekçesi vardı ve üçü de İLANLAR içindi: (1) uç
 * `MARKETPLACE_LIVE` kapalıyken boş döner, (2) maskeleme/davet/bağlantı
 * görünürlüğünü taşımaz, (3) bağlantıya özel ilanlar orada hiç yok.
 * Üründe hiçbiri geçerli değil: firma-altı ürün ucunda `MarketplaceLiveGuard`
 * YOKTUR (sözleşme `public-product.spec.ts` bunu kilitliyor — "görünürlük ≠
 * indekslenme"), üründe maskeleme ekseni yok, ve kapı iki tarafta da AYNI tek
 * kaynaktır (`publicProductWhere`). Panele ayrı bir detay ucu yazmak, aynı
 * mapper'ın ikinci bir kopyasını üretirdi.
 *
 * `null` = yok/erişilemez (404) — sayfa "bulunamadı" gösterir.
 */
export function usePublicProduct(companySlug: string, productSlug: string) {
  return useQuery<{
    product: PublicProduct;
    company: PublicProductCompany;
  } | null>({
    queryKey: ["public-product", companySlug, productSlug],
    enabled: !!companySlug && !!productSlug,
    queryFn: async () => {
      try {
        const { data } = await companyApi.get(
          `/public/companies/${encodeURIComponent(companySlug)}/products/${encodeURIComponent(productSlug)}`,
        );
        return data;
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}
