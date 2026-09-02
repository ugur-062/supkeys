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

export interface ProductShowcase {
  id: string;
  name: string;
  slug: string | null;
  isPublic: boolean;
  publishedAt: string | null;
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
  /** 0-100 + eksik maddeler. Formda canlı gösterilir. */
  completion: {
    score: number;
    missing: { key: string; label: string; points: number }[];
  };
  /** Yayımlamayı ENGELLEYEN eksikler — skordan AYRI ve daha dar. */
  publishBlockers: string[];
  attributeDefs: AttributeDef[];
}

export interface ShowcasePatch {
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

/* ================================================================== */
/* TOPLU İÇE AKTARMA (Faz 4)                                           */
/* ================================================================== */

export interface ProductImportRow {
  rowNumber: number;
  name: string;
  code: string | null;
  description: string | null;
  categoryId: string | null;
  unit: string;
  brand: string | null;
  mpn: string | null;
  keywords: string[];
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  price: number | null;
  currency: string | null;
  moq: number | null;
  /** Bu satırdaki sorunlar — satır yine yazılabilir, kullanıcı görsün diye. */
  issues: string[];
}

export interface ProductImportResult {
  rows: ProductImportRow[];
  /** Dosya geneli uyarılar (kırpılan satır, tanınmayan sütun…). */
  notices: string[];
}

/**
 * Dosyayı ÖNİZLEMEYE gönderir — hiçbir şey yazılmaz.
 * Yazma ayrı bir onay adımı (`useCommitProductImport`).
 */
export function useParseProductImport() {
  return useMutation<ProductImportResult, Error, File>({
    mutationFn: async (file) => {
      const dataBase64 = await fileToBase64(file);
      const { data } = await companyApi.post<ProductImportResult>(
        "/company/items/import/parse",
        { fileName: file.name, mimeType: file.type, dataBase64 },
      );
      return data;
    },
  });
}

export function useCommitProductImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ProductImportRow[]) => {
      const { data } = await companyApi.post<{
        created: number;
        updated: number;
      }>("/company/items/import/commit", {
        rows: rows.map((r) => ({
          name: r.name,
          code: r.code,
          description: r.description,
          categoryId: r.categoryId,
          unit: r.unit,
          brand: r.brand,
          mpn: r.mpn,
          keywords: r.keywords,
          priceMode: r.priceMode,
          price: r.price,
          currency: r.currency,
          moq: r.moq,
        })),
      });
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}

/**
 * "Katalogdan ürün ekle (AI)" — kullanıcının YÜKLEDİĞİ katalogdan (PDF/foto/
 * tablo) ürün satırları. Çıktı Excel yoluyla AYNI sözleşme
 * (`ProductImportResult`) → aynı önizleme, aynı `commit` ucu.
 *
 * Dosya API gövdesinden geçmez: presigned PUT ile doğrudan R2'ya gider
 * (tender-extract ile aynı anahtar alanı).
 */
export function useAiProductExtract() {
  return useMutation<ProductImportResult, Error, File[]>({
    mutationFn: async (files) => {
      const fileKeys: string[] = [];
      for (const f of files) {
        const { data: presigned } = await companyApi.post<{
          url: string;
          key: string;
        }>("/company/ai/uploads/url", {
          fileName: f.name,
          mimeType: f.type,
          fileSize: f.size,
        });
        const put = await fetch(presigned.url, {
          method: "PUT",
          body: f,
          headers: { "Content-Type": f.type },
        });
        if (!put.ok) throw new Error("Dosya yüklenemedi — lütfen tekrar deneyin");
        fileKeys.push(presigned.key);
      }
      const { data } = await companyApi.post<ProductImportResult>(
        "/company/ai/product-extract",
        { fileKeys },
        // Çok sayfalı katalog vision çıkarımı global 45sn'yi aşabilir.
        { timeout: 180_000 },
      );
      return data;
    },
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      // `data:...;base64,` önekini sunucu da soyuyor ama burada da temizle.
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}
