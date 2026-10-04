import type { Prisma } from "@rothern/db";
import {
  PUBLIC_LISTING_SELECT,
  toPublicListingCard,
  type PublicCategoryMap,
  type PublicListing,
  type PublicListingCard,
  type PublicListingRow,
} from "../public-marketplace/dto/public-listing.projection";

/**
 * ÜCRETSİZ ÜYENİN MASKELİ TALEPLERİ (2026-10-03, kullanıcı kararı: "ücretsiz
 * üyelere bunlar normal satın alma talebi gibi şirket isimleri gizli şekilde
 * gözükmeli … en yukarıda bağlantılı üyelerininki gözükmeli").
 *
 * STANDART tedarikçi Açık Talepler'de önce davetli/bağlantılı taleplerini
 * (tam satır, `sellerTenders`), altında Silver bir üyenin göreceği HERKESE
 * AÇIK talepleri ALICI KİMLİĞİ GİZLİ görür. Maskeli satırın ve maskeli
 * görünümün TEK veri kaynağı herkese açık yansıtmadır (`PUBLIC_LISTING_SELECT`
 * + `toPublicListingCard`/`toPublicListingDetail`): ziyaretçinin `/talep/<slug>`
 * sayfasında gördüğünden FAZLASI buradan çıkamaz. Sahip/teklifçi serileştiricisi
 * (`getOne`) bu yola girmez; teklif/belge/mesaj kapıları değişmedi.
 *
 * Seçim herkese açık seçimin AYNISI: 2026-10-04'e dek şehir süzgeci anahtarı
 * için `company.cityId` de çekiliyordu; sahip kararıyla talepte alıcının
 * şehri hiçbir yerde gösterilmiyor ve süzülmüyor (süzgeç alıcı ÜLKESİ,
 * kartın `company.country`si) — ek alan kalmadı.
 */
export const MASKED_LISTING_SELECT = PUBLIC_LISTING_SELECT satisfies Prisma.ListingSelect;

export type MaskedListingRow = Prisma.ListingGetPayload<{ select: typeof MASKED_LISTING_SELECT }>;

/**
 * Maskeli satır = herkese açık KART + yalnız şunlar:
 *  · `format` ve `itemNames` — herkese açık DETAYIN zaten verdiği alanlar
 *    (usul ve kalem adları, `/talep/<slug>`),
 *  · izleyenin KENDİ verisinden sinyaller (kategori/ürün eşleşmesi).
 * İç kimlik (`id`, `companyId`), firma adı/unvanı/slug/logo/Rothern ID,
 * adres, kişi, ek, şartname YOK — `masked-public-tenders.spec.ts` alan
 * kümesini birebir kilitler.
 */
export type MaskedTenderRow = PublicListingCard & {
  masked: true;
  format: string | null;
  itemNames: string[];
  categoryMatch: boolean;
  productMatch: boolean;
  matchedProduct: string | null;
  /** İçerik çevirisinden gelir (i18n Faz 1e); çeviri yoksa alan yok. */
  translatedFrom?: string;
};

/** Maskeli görünüm = herkese açık DETAY (+ bayrak). */
export type MaskedTenderDetail = PublicListing & { masked: true };

/** Maskesiz görülebilen talep (davetli/bağlı/teklifli ya da paketli) — tam detaya yönlendirme. */
export type UnmaskedTenderRedirect = { masked: false; id: string };

/** Kalem adları — herkese açık detayla aynı tavan yok; satır araması için ilk 20. */
const ITEM_NAME_CAP = 20;

export function toMaskedTenderRow(
  row: MaskedListingRow,
  cats: PublicCategoryMap,
  extra: {
    categoryMatch: boolean;
    productMatch: boolean;
    matchedProduct: string | null;
  },
): MaskedTenderRow {
  return {
    ...toPublicListingCard(row as PublicListingRow, cats),
    masked: true,
    format: row.format,
    itemNames: row.items.slice(0, ITEM_NAME_CAP).map((i) => i.name),
    ...extra,
  };
}

/** Talep numarası biçimi (`ROT-000042`) — başka bir şey sorguya gitmez. */
export function isListingNumber(raw: string): boolean {
  return /^[A-Za-z0-9-]{1,40}$/.test(raw);
}
