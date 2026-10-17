"use client";

import { companyApi } from "@/lib/company-auth/api";
import type {
  PublicProduct,
  PublicProductCompany,
  ProductPriceFields,
  ProductListParams,
  ProductIndexPage,
  ProductFacetParams,
  ProductFacets,
  RelatedProducts,
} from "@/lib/public/marketplace-api";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { withVisibleRowCategories, type SellerTenderRow } from "./use-seller-tenders";

/**
 * PANO KEŞİF BLOĞU — veri katmanı.
 *
 * Panelin KENDİ auth'lu uçlarını kullanır; pazar yerinin herkese açık uçları
 * BURADA KULLANILMAZ. Sebep üç katlı: (1) `MARKETPLACE_LIVE` kapalıyken boş
 * dönerler, (2) maskeleme/davet/bağlantı görünürlüğünü taşımazlar,
 * (3) panelin göreceği içeriğin bir kısmı (bağlantıya özel ilanlar) orada
 * hiç yok.
 */

export interface DiscoverProduct {
  slug: string;
  name: string;
  excerpt: string | null;
  translatedFrom?: string | null;
  images: string[];
  unit: string;
  categoryId: string | null;
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount: string | null;
  priceTiers: { minQty: number; unitPrice: number }[] | null;
  priceCurrency: string;
  moq: string | null;
  company: {
    name: string;
    slug: string;
    city: string | null;
    /** KYC doğrulaması tamam — kartta "Doğrulanmış" rozeti. */
    verified: boolean;
    activities: string[];
  };
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
export function useDiscoverListings(limit = 6) {
  return useQuery<SellerTenderRow[]>({
    queryKey: ["company-listings", "discover", "ALIM", limit],
    queryFn: async () => {
      const { data } = await companyApi.get<SellerTenderRow[]>(
        `/company/listings/seller-tenders?type=ALIM&limit=${limit}&openOnly=true`,
      );
      // Aynı uç, aynı kural: gizli segmentteki kategori satıra girmez.
      return data.map(withVisibleRowCategories);
    },
    staleTime: 30_000,
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
/** Üye katmanı ürün — fiyat/MOQ DAHİL; public uç bunları döndürmez. */
export type MemberProduct = PublicProduct & ProductPriceFields;

export function usePublicProduct(companySlug: string, productSlug: string) {
  return useQuery<{
    product: MemberProduct;
    company: PublicProductCompany & { verified?: boolean; website?: string | null; freeMember?: boolean };
  } | null>({
    queryKey: ["member-product", companySlug, productSlug],
    enabled: !!companySlug && !!productSlug,
    queryFn: async () => {
      try {
        // Panelin KENDİ ucu (görünürlük katmanı, 2026-09-04): herkese açık
        // `public/companies/.../products/...` artık fiyat döndürmüyor.
        const { data } = await companyApi.get(
          `/company/items/discover/${encodeURIComponent(companySlug)}/${encodeURIComponent(productSlug)}`,
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


/**
 * ÜRÜN ARA — herkese açık `/urunler` ile AYNI süzgeç/sıralama (API tek
 * kaynak `product-index.ts`), sayfalı; kendi ürünler hariç.
 */
export function useDiscoverSearch(
  params: ProductListParams & { page?: number; pageSize?: number },
  opts: { enabled?: boolean } = {},
) {
  return useQuery<ProductIndexPage>({
    queryKey: ["company-items", "discover-search", params],
    enabled: opts.enabled ?? true,
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.q) sp.set("q", params.q);
      if (params.category) sp.set("category", params.category);
      if (params.city) sp.set("city", params.city);
      if (params.country) sp.set("country", params.country);
      if (params.activity) sp.set("activity", params.activity);
      if (params.verified) sp.set("verified", "1");
      if (params.price) sp.set("price", params.price);
      if (params.sort && params.sort !== "relevance") sp.set("sort", params.sort);
      // Seçilmediyse gönderilmez → sunucu FİRMANIN ülkesinin birimini kullanır.
      if (params.currency) sp.set("currency", params.currency);
      if (params.priceMin != null) sp.set("priceMin", String(params.priceMin));
      if (params.priceMax != null) sp.set("priceMax", String(params.priceMax));
      if (params.moqMax != null) sp.set("moqMax", String(params.moqMax));
      if (params.priceUnpriced) sp.set("priceUnpriced", "1");
      if (params.cert) sp.set("cert", params.cert);
      if (params.employees) sp.set("employees", params.employees);
      if (params.near && params.radius) {
        sp.set("near", params.near);
        sp.set("radius", String(params.radius));
      }
      if (params.fastReply) sp.set("fastReply", "1");
      for (const a of params.attr ?? []) sp.append("attr", a);
      if (params.page && params.page > 1) sp.set("page", String(params.page));
      if (params.pageSize) sp.set("pageSize", String(params.pageSize));
      const qs = sp.toString();
      const { data } = await companyApi.get<ProductIndexPage>(`/company/items/discover/search${qs ? `?${qs}` : ""}`);
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useDiscoverProductFacets(params: ProductFacetParams = {}) {
  return useQuery<ProductFacets>({
    queryKey: ["company-items", "discover-facets", params],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.category) sp.set("category", params.category);
      if (params.q) sp.set("q", params.q);
      if (params.city) sp.set("city", params.city);
      if (params.country) sp.set("country", params.country);
      if (params.activity) sp.set("activity", params.activity);
      if (params.verified) sp.set("verified", "1");
      if (params.price) sp.set("price", params.price);
      if (params.cert) sp.set("cert", params.cert);
      if (params.employees) sp.set("employees", params.employees);
      if (params.near && params.radius) {
        sp.set("near", params.near);
        sp.set("radius", String(params.radius));
      }
      if (params.fastReply) sp.set("fastReply", "1");
      if (params.currency) sp.set("currency", params.currency);
      const qs = sp.toString();
      const { data } = await companyApi.get<ProductFacets>(`/company/items/discover/facets${qs ? `?${qs}` : ""}`);
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 120_000,
  });
}

/**
 * İlişkili bloklar — PANEL ucu (arayüz testi D-231): herkese açık uçla aynı
 * fonksiyon, ama "diğer tedarikçiler" blokları görüntüleyenin kendi firmasını
 * ve engel ilişkili firmaları dışlar (herkese açık uç görüntüleyeni bilmez).
 */
export function useRelatedProducts(companySlug: string, productSlug: string) {
  return useQuery<RelatedProducts>({
    queryKey: ["panel-product", "related", companySlug, productSlug],
    enabled: !!companySlug && !!productSlug,
    queryFn: async () => {
      const { data } = await companyApi.get<RelatedProducts>(
        `/company/market/related/${encodeURIComponent(companySlug)}/${encodeURIComponent(productSlug)}`,
      );
      return data;
    },
    staleTime: 300_000,
  });
}

/** 58 üst kategori (L1) — kategori vitrini için doldurma listesi. Herkese
 *  açık `categories/segments` ucu; panelden de aynı adres. 1 saat taze. */
export function useCategorySegments() {
  return useQuery<{ id: string; nameTr: string; slug?: string }[]>({
    queryKey: ["categories", "segments"],
    queryFn: async () => {
      const { data } = await companyApi.get<{ id: string; nameTr: string; slug?: string }[]>("/categories/segments");
      return data;
    },
    staleTime: 60 * 60_000,
  });
}
