import { slugifyText } from "@rothern/shared";

/**
 * PAZAR YERİ SÖZLÜĞÜ — giriş YAPMAMIŞ ziyaretçinin gördüğü her ad buradan.
 *
 * Neden `company/portals.ts` MODULE_LABELS'a eklenmedi: o sözlük iyelik
 * kipiyle yazılmıştır ("Taleplerim", "Satış İlanlarım") ve portal anahtarına
 * (satinalma/satis) bağlıdır. Ziyaretçinin ne alıcısı ne satıcısı vardır;
 * ÜÇÜNCÜ bir çerçeve gerekir:
 *
 *   kayıt          | satınalma portalı | satış portalı   | PAZAR YERİ (burası)
 *   ---------------|-------------------|-----------------|--------------------
 *   ALIM listing   | "Taleplerim"      | "Açık Talepler" | "Alım Talepleri"
 *   SATIS listing  | —                 | "Satış İlanlarım"| "Satılık İlanlar"
 *
 * Aynı kaydın üç adı olması gevşeklik değil, iyelik kipinin zorunlu sonucu:
 * ziyaretçiye "Taleplerim" demek yanlış, "Açık Talepler" ise "bana açık"
 * imasıyla yanlış olur.
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
  demands: "/alim-talepleri",
  /** Firmalar-arası ÜRÜN dizini (vitrin). */
  products: "/urunler",
  /** SATIS ilanları listesi. */
  offers: "/satilik",
  /**
   * Firma dizini — GİRİŞ GEREKTİRİR (ürün kararı 2026-09-02), bu yüzden
   * `PUBLIC_ROUTE_PREFIXES`te YOKTUR ve sitemap'e girmez. Rota sabiti burada
   * duruyor çünkü menü/altbilgi hâlâ bağlantı veriyor: anonim ziyaretçi
   * "kaydolun" ekranını görür — dönüşüm hunisi, çıkmaz değil.
   */
  companies: "/tedarikciler",
  /** Tekil ALIM ilanı. */
  demand: "/talep",
  /** Tekil SATIS ilanı. */
  offer: "/ilan",
} as const;

export const MARKETPLACE_LABELS = {
  demands: "Alım Talepleri",
  offers: "Satılık İlanlar",
  /**
   * ÜRÜN ≠ İLAN. İlan süreli bir işlemdir ("Satılık İlanlar"), ürün firmanın
   * kalıcı vitrinidir. Ziyaretçiye "ilan" demek, kapanmayan bir kaydı süreli
   * sanmasına yol açar.
   */
  products: "Ürünler",
  companies: "Firmalar",
  /** Tekil kayıt için başlık öneki (sayfa H1'inde değil, listelerde rozet). */
  demandOne: "Alım talebi",
  offerOne: "Satılık ilan",
} as const;

export type PublicListingType = "ALIM" | "SATIS";

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
const NUMBER_RE = /^(rot-\d+)(?:-|$)/i;

export function listingSlug(number: string, title: string): string {
  const head = slugifyText(number);
  const tail = slugifyText(title);
  // Başlık tamamen alfanümerik-dışıysa (emoji vb.) yalnız numara kalır —
  // geçerli bir URL üretmek başlığı korumaktan önemli.
  return tail ? `${head}-${tail}` : head;
}

/** Slug parçasından ilan numarasını çıkarır (`ROT-000042`). Yoksa null. */
export function parseListingNumber(slug: string): string | null {
  const m = NUMBER_RE.exec(slug.trim());
  return m ? m[1].toUpperCase() : null;
}

export function listingPath(
  type: PublicListingType,
  number: string,
  title: string,
): string {
  const base =
    type === "ALIM" ? MARKETPLACE_ROUTES.demand : MARKETPLACE_ROUTES.offer;
  return `${base}/${listingSlug(number, title)}`;
}

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
const CATEGORY_CODE_RE = /^(\d{8})(?:-|$)/;

export function categoryPath(code: string, name?: string): string {
  const tail = name ? slugifyText(name) : "";
  const slug = tail ? `${code}-${tail}` : code;
  return `${MARKETPLACE_ROUTES.products}/kategori/${slug}`;
}

/** Yol parçasından kategori kodunu çıkarır. Geçersizse null. */
export function parseCategoryCode(slug: string): string | null {
  const m = CATEGORY_CODE_RE.exec(slug.trim());
  return m ? m[1] : null;
}
