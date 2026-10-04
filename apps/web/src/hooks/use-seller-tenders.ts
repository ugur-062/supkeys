"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import type { PublicListingCard, PublicListingDetail } from "@/lib/public/marketplace-api";
import { PAID_TIER, tierAtLeast } from "@rothern/shared";
import { useQuery } from "@tanstack/react-query";

/** GET /company/listings/seller-tenders satırı. */
export interface SellerTenderRow {
  /** Maskeli satırda iç kimlik YOK — `masked:<numara>` (yalnız React anahtarı). */
  id: string;
  /**
   * Ücretsiz üyenin ALICI GİZLİ herkese açık talebi (2026-10-03): satır
   * `GET …/seller-tenders/masked`ten gelir, `owner` null, teklif Silver ile;
   * tıklayınca panel içi maskeli görünüm (`maskedRequestHref`).
   */
  masked?: boolean;
  /** Maskeli satırda alıcının "Doğrulanmış alıcı" rozeti (kimlik değil nitelik). */
  ownerVerified?: boolean;
  number: string | null;
  title: string;
  status: string;
  visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE";
  format: string | null;
  currency: string;
  isInternational: boolean;
  /** Görünürlük ülkeleri (boş = tüm ülkeler). */
  targetCountries?: string[];
  /** Talebin açıldığı ülke (alıcının ülkesi) — Açık Talepler "Alıcı ülkesi" süzgeci. */
  ownerCountry?: string | null;
  closesAt: string | null;
  createdAt: string;
  itemCount: number;
  /**
   * Alıcının ŞEHRİ YOK (2026-10-04 sahip kararı): talepte konum = ülke
   * (`ownerCountry`); API `ownerCity*` alanlarını artık göndermiyor.
   */
  owner: { id: string; name: string } | null;
  /** Kapak görseli: sahibin seçtiği, yoksa ilk kalemin ilk görseli. */
  coverImageUrl?: string | null;
  canBid: boolean;
  invited: boolean;
  /** Talebi açan firma bağlantım mı (aktif iş ilişkisi) — sıralama sinyali. */
  connected: boolean;
  myBidStatus: string | null;
  /** Gönderim sayısı ("· v2" eki; taslak saymaz — arayüz testi O-036). */
  myBidSubmitCount: number | null;
  categoryMatch: boolean;
  /** Alıcının aradığı tedarikçi tipi bende var mı — sıralama basamağı. */
  activityMatch?: boolean;
  /** Talebin aradığı tedarikçi tipi (boş = fark etmez). */
  preferredActivities?: string[];
  /**
   * İlgi motoru: bu ilan neden karşınıza çıktı ("Bu alanda daha önce teklif
   * verdiniz" gibi). Backend ham sinyalden türetir; null olabilir.
   */
  matchReason?: string | null;
  /** İlgi skoru (0-100, firma başına normalize). Sıralama kademesi için. */
  matchScore?: number;
  categories: { code: string; name: string }[];
  extraCategoryCount: number;
  /** İlk 20 kalem adı — arama "kalem" ile de bulsun (2026-09-05). */
  itemNames?: string[];
  /** Başlık/kalem adları okuyucunun diline otomatik çevrildiyse kaynağın dili (i18n Faz 1e). */
  translatedFrom?: string | null;
  /** Kataloğumdaki bir ürün talebin kategorisi/kalemleriyle eşleşiyor. */
  productMatch?: boolean;
  /** Eşleşen ürünün adı (kullanıcı yüzü). */
  matchedProduct?: string | null;
}

/**
 * GET /company/listings/seller-tenders/masked satırı — herkese açık KART
 * yansıtması (`toPublicListingCard`) + usul, kalem adları ve izleyenin
 * eşleşme sinyalleri. Alıcı adı/kimliği/iç kimlik ve şehri YOK.
 */
export type MaskedTenderApiRow = Omit<PublicListingCard, "translatedFrom"> & {
  masked: true;
  format: string | null;
  itemNames: string[];
  categoryMatch: boolean;
  productMatch: boolean;
  matchedProduct: string | null;
  translatedFrom?: string | null;
};

/** Panel içi maskeli talep görünümü (numarayla — iç kimlik ücretsiz üyeye verilmez). */
export function maskedRequestHref(number: string): string {
  return `/company/satis/acik-talep/${encodeURIComponent(number)}`;
}

/**
 * Maskeli API satırı → liste satırı. Süzgeç/arama/sıralama/sektör sayacı aynı
 * motoru (`request-facets`) okusun diye AYNI şekle çevrilir; alıcı alanları
 * boş, eylem bayrakları kapalı (teklif Silver ile).
 */
export function maskedRowToSellerRow(m: MaskedTenderApiRow): SellerTenderRow {
  return {
    id: `masked:${m.number}`,
    masked: true,
    number: m.number,
    title: m.title,
    status: m.status,
    visibility: "PUBLIC",
    format: m.format,
    currency: m.primaryCurrency,
    isInternational: m.isInternational,
    targetCountries: m.targetCountries,
    ownerCountry: m.company.country,
    closesAt: m.closesAt,
    // "Yayın tarihi" süzgeci ve "en yeni" sıralaması — herkese açık yayın anı.
    createdAt: m.publishedAt ?? "",
    itemCount: m.itemCount,
    owner: null,
    ownerVerified: m.company.verified,
    coverImageUrl: m.coverImageUrl,
    canBid: false,
    invited: false,
    connected: false,
    myBidStatus: null,
    myBidSubmitCount: null,
    categoryMatch: m.categoryMatch,
    productMatch: m.productMatch,
    matchedProduct: m.matchedProduct,
    categories: m.categories.slice(0, 2).map((c) => ({ code: c.id, name: c.name })),
    extraCategoryCount: Math.max(0, m.categories.length - 2),
    itemNames: m.itemNames,
    translatedFrom: m.translatedFrom ?? null,
  };
}

/**
 * Başka firmaların AÇIK ALIM talepleri (Açık Talepler). Ücretsiz üyede liste
 * İKİ uçtan kurulur (2026-10-03): önce tam satırlar (davetli/bağlantılı —
 * teklif verilebilir), ardından alıcı gizli herkese açık talepler. Paketli
 * üye maskeli ucu hiç çağırmaz (API ona zaten boş döner).
 */
export function useSellerTenders() {
  const tier = useCompanyAuthStore((s) => s.company?.tier);
  const withMasked = !tierAtLeast(tier ?? "STANDART", PAID_TIER);
  return useQuery<SellerTenderRow[]>({
    queryKey: ["company-listings", "seller-tenders", "ALIM", withMasked ? "masked" : "full"],
    queryFn: async () => {
      const [full, masked] = await Promise.all([
        companyApi.get<SellerTenderRow[]>("/company/listings/seller-tenders?type=ALIM").then((r) => r.data),
        withMasked
          ? companyApi
              .get<MaskedTenderApiRow[]>("/company/listings/seller-tenders/masked")
              .then((r) => r.data.map(maskedRowToSellerRow))
              // Maskeli küme ek bilgidir: alınamazsa teklif verilebilir talepler
              // yine listelenir (tam liste hatası ise sorguyu düşürür).
              .catch(() => [] as SellerTenderRow[])
          : Promise.resolve([] as SellerTenderRow[]),
      ]);
      return [...full, ...masked];
    },
    staleTime: 10_000,
    refetchInterval: 15_000, // canlı liste — teklif durumu/kapanış tazelensin
    refetchOnWindowFocus: true,
  });
}

/** Maskeli görünüm yanıtı: herkese açık detay, ya da maskesiz görülebiliyorsa tam detay kimliği. */
export type MaskedTenderResponse =
  | (PublicListingDetail & { masked: true })
  | { masked: false; id: string };

/** GET /company/listings/seller-tenders/masked/:number — panel içi maskeli talep görünümü. */
export function useMaskedTender(number: string) {
  return useQuery<MaskedTenderResponse>({
    queryKey: ["company-listings", "seller-tenders", "masked-detail", number],
    queryFn: async () => {
      const { data } = await companyApi.get<MaskedTenderResponse>(
        `/company/listings/seller-tenders/masked/${encodeURIComponent(number)}`,
      );
      return data;
    },
    enabled: !!number,
    staleTime: 30_000,
    retry: false,
  });
}
