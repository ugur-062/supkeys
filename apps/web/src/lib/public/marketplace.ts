import {
  PUBLIC_PATHS,
  categoryPath as sharedCategoryPath,
  listingPath as sharedListingPath,
  listingSlug as sharedListingSlug,
  parseCategoryCode as sharedParseCategoryCode,
  parseListingNumber as sharedParseListingNumber,
} from "@rothern/shared";

/**
 * PAZAR YERİ SÖZLÜĞÜ — giriş YAPMAMIŞ ziyaretçinin gördüğü her ad buradan.
 *
 * Neden `company/portals.ts` MODULE_LABELS'a eklenmedi: o sözlük iyelik
 * kipiyle yazılmıştır ("Taleplerim", "Ürünlerim") ve portal anahtarına
 * (satinalma/satis) bağlıdır. Ziyaretçinin ne alıcısı ne satıcısı vardır;
 * ÜÇÜNCÜ bir çerçeve gerekir:
 *
 *   kayıt          | satınalma portalı | satış portalı   | PAZAR YERİ (burası)
 *   ---------------|-------------------|-----------------|--------------------
 *   ALIM listing   | "Taleplerim"      | "Açık Talepler" | "Alım Talepleri"
 *   ürün           | "Ürün Ara"        | "Ürünlerim"     | "Ürünler"
 *
 * Aynı kaydın üç adı olması gevşeklik değil, iyelik kipinin zorunlu sonucu:
 * ziyaretçiye "Taleplerim" demek yanlış, "Açık Talepler" ise "bana açık"
 * imasıyla yanlış olur.
 *
 * Satış ilanı (SATIS) özelliği 2026-09-04'te kaldırıldı: `/satilik` ve
 * `/ilan/*` `next.config.ts` ile `/urunler`e 308 yönlenir.
 */

/* ------------------------------------------------------------------ */
/* Rotalar                                                             */
/* ------------------------------------------------------------------ */

/**
 * Pazar yeri rotaları. `lib/public-routes.ts` PUBLIC_ROUTE_PREFIXES ile
 * TUTARLI olmak ZORUNDA — orada listelenmeyen bir rota nonce'lı CSP alır ve
 * statik üretilemez. `marketplace.test.ts` bunu doğrular.
 */
export const MARKETPLACE_ROUTES = {
  /** ALIM ilanları listesi (satın alma talepleri). */
  demands: PUBLIC_PATHS.demands,
  /** Firmalar-arası ÜRÜN dizini (vitrin). */
  products: PUBLIC_PATHS.products,
  /** Firma dizini — HERKESE AÇIK (görünürlük v2, 2026-09-04); sitemap'te. */
  companies: PUBLIC_PATHS.companies,
  /** Tekil ALIM talebi. */
  demand: PUBLIC_PATHS.demand,
} as const;

export const MARKETPLACE_LABELS = {
  demands: "Alım Talepleri",
  /**
   * ÜRÜN ≠ TALEP. Talep süreli bir işlemdir, ürün firmanın kalıcı vitrinidir.
   * Ziyaretçiye ürüne "ilan" demek, kapanmayan bir kaydı süreli sanmasına yol
   * açar.
   */
  products: "Ürünler",
  companies: "Firmalar",
  /** Tekil kayıt için başlık öneki (sayfa H1'inde değil, listelerde rozet). */
  demandOne: "Alım talebi",
} as const;

export type PublicListingType = "ALIM";

/* ------------------------------------------------------------------ */
/* Slug — numara ÖNDE                                                  */
/* ------------------------------------------------------------------ */

/**
 * Numara başta durur (`rot-000042-celik-boru-alimi`) çünkü ayrıştırma tek ve
 * kayma ihtimali olmayan bir düzenli ifadeye iner. Başlık başta olsaydı
 * numarayı bulmak için "sondan iki tire" gibi kırılgan bir kural gerekirdi ve
 * başlığın kendisi "…-rot-1" ile bitiyorsa sessizce yanlış kaydı açardı.
 *
 * Başlık değişince slug değişir ama numara aynı kalır → sayfa aynı kaydı
 * bulmaya devam eder; kanonik URL'e 308 ile yönlendirilir (bkz. sayfa).
 */
/*
 * UYGULAMA `@rothern/shared` `helpers/public-paths.ts`te (SEO Parça 5):
 * API de yayın anında aynı adresi üretip motorlara bildiriyor. Buradaki
 * adlar korunuyor ki 40+ çağıran dokunulmadan kalsın.
 */
export const listingSlug = sharedListingSlug;
export const parseListingNumber = sharedParseListingNumber;
export const listingPath = sharedListingPath;

/* ------------------------------------------------------------------ */
/* Durum — ziyaretçiye gösterilen                                      */
/* ------------------------------------------------------------------ */

/**
 * Ziyaretçi paneldeki dokuz durumu umursamaz; üçü yeter. Eşleme BURADA
 * daraltılır ki sayfa bileşenleri iç durum makinesini bilmek zorunda kalmasın.
 *
 * DRAFT / IN_APPROVAL pazar yerine HİÇ çıkmaz (yayımlanmamış kayıt) — bu
 * yüzden eşlemede yok; API sorgusu onları zaten süzer.
 */
export type PublicListingState = "open" | "evaluating" | "closed";

const STATE_BY_STATUS: Record<string, PublicListingState> = {
  OPEN: "open",
  IN_AWARD: "evaluating",
  IN_AWARD_APPROVAL: "evaluating",
  AWARDED: "closed",
  CLOSED: "closed",
  CLOSED_NO_AWARD: "closed",
  CANCELLED: "closed",
};

export function publicState(status: string): PublicListingState {
  return STATE_BY_STATUS[status] ?? "closed";
}

export const STATE_LABEL: Record<PublicListingState, string> = {
  open: "Teklife açık",
  evaluating: "Değerlendirmede",
  closed: "Kapandı",
};

/**
 * Yalnız "open" indekslenir. Kapanmış kayıt sitede DURUR (arşiv değeri var,
 * bağlantısı kırılmaz) ama `noindex` alır ve sitemap'ten düşer: Google süresi
 * geçmiş ilanı taze içerik sanıp gösterirse hem kullanıcıyı yanıltır hem de
 * alan adının güvenilirliğini aşağı çeker (klasik "expired job posting"
 * cezası). "evaluating" de indekslenmez — teklif alınmıyor, sayfa aksiyonsuz.
 */
export function isIndexableState(state: PublicListingState): boolean {
  return state === "open";
}

/* ------------------------------------------------------------------ */
/* Ürün dizini — kategori yolu                                         */
/* ------------------------------------------------------------------ */

/**
 * `/urunler/kategori/39000000-elektrik-malzemeleri`
 *
 * Süzgeç neden SORGU değil YOL: `?kategori=…` okuyan sayfa Next 15'te dinamik
 * olmak zorunda ve kenar önbelleğine giremiyor. Yol parçası olduğunda sayfa
 * STATİK üretilebiliyor ve her kategori kendi başına indekslenebilir bir
 * adres kazanıyor — long-tail'in tamamı buradan geliyor.
 *
 * KOD ÖNDE, ilan slug'ıyla aynı gerekçe: ayrıştırma tek ve kayma ihtimali
 * olmayan bir düzenli ifadeye iner. Ad sonda olsaydı "…-39000000" ile biten
 * bir kategori adı sessizce yanlış kodu verirdi.
 */
/* Uygulama `@rothern/shared` `public-paths.ts`te — bkz. listing bloğu. */
export const categoryPath = sharedCategoryPath;
export const parseCategoryCode = sharedParseCategoryCode;
