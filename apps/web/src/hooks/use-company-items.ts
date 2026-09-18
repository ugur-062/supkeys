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
  /** Vitrin özeti — liste satırındaki durum rozeti/küçük görsel/fiyat modu. */
  isPublic: boolean;
  publishedAt: string | null;
  /** Moderasyon (2026-09-09): DRAFT | PENDING | APPROVED | REJECTED. */
  reviewStatus: ProductReviewStatus;
  rejectReason: string | null;
  thumbnailUrl: string | null;
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  /** Ürünlerim tablosu (2026-09-18): fiyat · min. sipariş · görüntülenme · eklenme. */
  priceAmount?: string | null;
  priceCurrency?: string | null;
  moq?: string | null;
  viewCount?: number | null;
  createdAt?: string | null;
  updatedAt: string;
}

/** Firma geneli vitrin sayaçları — süzgeçten bağımsız (sunucuda sayılır). */
export interface CatalogCounts {
  published: number;
  draft: number;
  /** Onay bekleyen — yayında olup yeniden incelenenler DAHİL. */
  pending: number;
  rejected: number;
}

export interface CatalogListResult {
  items: CatalogItem[];
  total: number;
  counts: CatalogCounts;
  /** Ücretsiz pakette yayında ürün tavanı (null = limitsiz) — `PRODUCT_LIMITS` aynası. */
  productLimit: number | null;
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

/**
 * Yalnız sayaçlar (pano "N yayında · M taslak"). Liste ucunun en dar çağrısı
 * (`take=1`) — ayrı bir sayaç ucu açmak, aynı sayımı iki yerde sürdürme
 * borcu üretirdi; sayaç zaten her liste yanıtında geliyor.
 */
export function useCatalogCounts(enabled = true) {
  return useQuery<CatalogCounts>({
    queryKey: [...CATALOG_KEY, "counts"],
    queryFn: async () => {
      const { data } = await companyApi.get<CatalogListResult>("/company/items", {
        params: { take: 1 },
      });
      return data.counts;
    },
    enabled,
    staleTime: 30_000,
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

/* ================================================================== */
/* VİTRİN (Faz 2) — kalemi herkese açık ÜRÜNE çeviren katman            */
/* ================================================================== */

export interface AttributeDef {
  key: string;
  nameTr: string;
  type: "SINGLE_SELECT" | "MULTI_SELECT" | "NUMBER" | "TEXT";
  options: string[];
  unit: string | null;
  isRequired: boolean;
  /** Hangi kategori düğümünden MİRAS alındı (formda rozet olarak gösterilir). */
  definedAt: string;
}

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export type ProductReviewStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export interface ProductShowcase {
  id: string;
  name: string;
  slug: string | null;
  isPublic: boolean;
  publishedAt: string | null;
  /** Moderasyon (2026-09-09): her ürün vitrine çıkmadan admin onayından geçer. */
  reviewStatus: ProductReviewStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  categoryId: string | null;
  description: string | null;
  images: string[];
  videoUrl: string | null;
  externalUrl: string | null;
  documents: { url: string; title: string }[] | null;
  keywords: string[];
  attributes: Record<string, string | string[]> | null;
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount: string | null;
  priceTiers: PriceTier[] | null;
  priceCurrency: string;
  moq: string | null;
  /** Satış birimi — vitrin formundan düzenlenir. */
  unit: string;
  unitCode: string | null;
  /** 0-100 + eksik maddeler. Sunucunun son kayıttaki hesabı; form canlı hesaplar. */
  completion: {
    score: number;
    missing: { key: string; label: string; points: number }[];
  };
  /** Yayımlamayı ENGELLEYEN eksikler — skordan AYRI ve daha dar. */
  publishBlockers: string[];
  attributeDefs: AttributeDef[];
}

export interface ShowcasePatch {
  unit?: string;
  unitCode?: string | null;
  categoryId?: string | null;
  images?: string[];
  videoUrl?: string | null;
  externalUrl?: string | null;
  documents?: { url: string; title: string }[];
  keywords?: string[];
  attributes?: Record<string, string | string[]>;
  priceMode?: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount?: number | null;
  priceTiers?: PriceTier[];
  priceCurrency?: string;
  moq?: number | null;
}

/**
 * Kategorinin ETKİN nitelik seti — ata zincirinden miras.
 * Kategori değişince form alanları buradan yeniden kurulur.
 */
/**
 * YENİ ÜRÜN — tek çağrı: kayıt + vitrin alanları birlikte.
 *
 * İlan açma bir sihirbazdır; ürün ekleme tek sayfadır (kullanıcı kararı
 * 2026-09-03). Bu yüzden "önce kalem aç, sonra vitrini doldur" iki adımına
 * bölmüyoruz — form bir kez gönderilir.
 */
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Record<string, unknown> & { name: string; unit: string },
    ) => {
      const { data } = await companyApi.post<ProductShowcase>(
        "/company/items/product",
        input,
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}

export function useCategoryAttributes(categoryId: string | null | undefined) {
  return useQuery<AttributeDef[]>({
    queryKey: [...CATALOG_KEY, "attributes", categoryId ?? "-"],
    // Kategori seçilmeden istek atma: nitelik seti kategoriye BAĞLI, kategorisiz
    // sorgu her zaman boş döner ve boşuna ağ trafiği üretir.
    enabled: !!categoryId,
    queryFn: async () => {
      const { data } = await companyApi.get<AttributeDef[]>(
        `/company/items/attributes/${categoryId}`,
      );
      return data;
    },
    staleTime: 5 * 60 * 1000, // matris nadiren değişir
  });
}

/**
 * Vitrin alanlarını OKUR (`GET :id/showcase`). Düzenleyici/önizleme açılışı
 * eskiden boş bir PATCH atıyordu; sunucu boş yamayı "hepsini sil" diye
 * yorumluyor (görsel/etiket/fiyat sıfırlanıyordu) ve inceleme kilidi
 * (409 PRODUCT_IN_REVIEW) PATCH'i zaten reddeder — okuma yan etkisiz.
 */
export async function fetchProductShowcase(id: string): Promise<ProductShowcase> {
  const { data } = await companyApi.get<ProductShowcase>(`/company/items/${id}/showcase`);
  return data;
}

export function useUpdateShowcase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ShowcasePatch }) => {
      const { data } = await companyApi.patch<ProductShowcase>(
        `/company/items/${id}/showcase`,
        patch,
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}

export function usePublishProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { data } = await companyApi.post<ProductShowcase>(
        `/company/items/${id}/${publish ? "publish" : "unpublish"}`,
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}

/**
 * Ürün görseli yükleme — İKİ adım.
 *
 * Tarayıcı R2'ye DOĞRUDAN yükler (sunucudan geçmez → gövde sınırına takılmaz),
 * sonra `resolve` yükleneni doğrular ve kalıcı CDN URL'i döner. İkinci adım
 * şart: presigned PUT ne boyutu ne içerik tipini imzalayabiliyor.
 */
export function useUploadProductImage() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const { data: signed } = await companyApi.post<{
        url: string;
        key: string;
      }>("/company/items/images/upload-url", {
        fileName: file.name,
        mimeType: file.type,
      });
      const put = await fetch(signed.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Görsel yüklenemedi");
      const { data } = await companyApi.post<{ url: string }>(
        "/company/items/images/resolve",
        { key: signed.key },
      );
      return data.url;
    },
  });
}

/** Ürün belgesi (PDF) — görselle aynı iki adım, ayrı allowlist. */
export function useUploadProductDocument() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const { data: signed } = await companyApi.post<{ url: string; key: string }>(
        "/company/items/documents/upload-url",
        { fileName: file.name, mimeType: file.type },
      );
      const put = await fetch(signed.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Belge yüklenemedi");
      const { data } = await companyApi.post<{ url: string }>(
        "/company/items/documents/resolve",
        { key: signed.key },
      );
      return data.url;
    },
  });
}
