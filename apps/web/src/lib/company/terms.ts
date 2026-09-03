import { PORTALS, allPortalRoutes } from "@/lib/company/portals";

/**
 * KAYIT TİPİ SÖZLÜĞÜ — sayaç, arama kutusu ve boş-durum metinleri buradan.
 *
 * Gerekçe: tek bir generic liste bileşeni İKİ farklı iş nesnesini çiziyor
 * (ALIM = satın alma talebi, SATIS = satış ilanı) ve metinler ALIM tarafına
 * sabitlenmişti. Sonuç: "Satış İlanlarım" sayfasında sayaç "1 satın alma
 * talebi" yazıyor, "Satın Al" sayfası "herkese açık satış satın alma
 * talepleri" gibi bozuk bir cümleye dönüşüyordu — ürün dili kararının
 * (2026-09-01) tam tersi: satış tarafında firma SATIYOR, orada "talep" TERS.
 *
 * Türkçe notu: `talep` son sesi yumuşar (talebi/talebe); `ilan` yumuşamaz.
 * Bu yüzden çekimli biçimler tek tek yazılır, kod ek YAPIŞTIRMAZ.
 */
export const LISTING_TERMS = {
  ALIM: {
    /** "1 satın alma talebi" — sayaç birimi. */
    unit: "satın alma talebi",
    /** "…adı veya numarası ara…" */
    searchNoun: "Satın alma talebi",
    /** "…açık satın alma talebi yayınlandığında" */
    indefinite: "satın alma talebi",
    /** Belirtme hâli: "…kapanan satın alma taleplerini" */
    pluralAccusative: "satın alma taleplerini",
  },
  SATIS: {
    unit: "satış ilanı",
    searchNoun: "Satış ilanı",
    indefinite: "satış ilanı",
    pluralAccusative: "satış ilanlarını",
  },
  /**
   * BAŞKA firmaların ALIM kayıtları, SATIŞ portalından bakınca — "Açık
   * Talepler". Satış tarafında tek terim "açık talep" (2026-09-03): "satın
   * alma talebi" satınalma modülünün sözcüğüdür; satıcıya aynı kaydı iki
   * adla göstermek (menüde "Açık Talepler", sayaçta "satın alma talebi")
   * iki farklı şey sanılmasına yol açıyordu.
   */
  ACIK_TALEP: {
    unit: "açık talep",
    searchNoun: "Açık talep",
    indefinite: "açık talep",
    pluralAccusative: "açık talepleri",
  },
} as const;

export type ListingTermKey = keyof typeof LISTING_TERMS;

/**
 * VARLIK SÖZLÜĞÜ — sihirbaz, ilan detayı, liste satırı, boş durum ve rapor
 * lejantı metinleri YALNIZ buradan (2026-09-03, v2 denetimi).
 *
 * Gerekçe: satış sihirbazı satın alma sihirbazının kopyasıydı; alıcı/satıcı
 * sözcükleri değişmiş ama VARLIK adı değişmemişti ("Satış İlanı" ekranında
 * "Satın Alma Talebi Adı", "Satın Alma Talebiniz kapalı zarf…"). Kullanıcı
 * bunu "kırık ürün" olarak okuyor.
 *
 * Türkçe hâller AÇIKÇA yazılır (kod ek yapıştırmaz): talep→talebi/talebin,
 * ilan→ilanı/ilanın. Satış tarafında kısa biçim "ilan", satınalmada "talep".
 */
export const ENTITY_LABELS = {
  satinalma: {
    entity: "Satın Alma Talebi",
    entityLower: "satın alma talebi",
    entityShort: "Talep",
    shortLower: "talep",
    /** "Talebi Yayınla" — kısa biçimin belirtme hâli. */
    shortAcc: "Talebi",
    acc: "satın alma talebini",
    gen: "satın alma talebinin",
    genCap: "Satın Alma Talebinin",
    dat: "satın alma talebine",
    loc: "satın alma talebinde",
    pluralLoc: "satın alma taleplerinde",
    yours: "Satın Alma Talebiniz",
    yoursLower: "satın alma talebiniz",
    yoursAcc: "satın alma talebinizi",
    yoursGen: "Satın Alma Talebinizin",
    yoursDat: "Satın Alma Talebinize",
    scopeDesc: "Satın alma talebinin kapsamı",
    counterparty: "Tedarikçi",
    counterpartyPlural: "Tedarikçiler",
    counterpartyPluralLower: "tedarikçiler",
    counterpartyPluralGen: "Tedarikçilerin",
    counterpartyPluralDat: "Tedarikçilere",
    /** Kaydı açan kişinin ROLÜ (menü/izin dili). Liste kolonunda "Sorumlu". */
    owner: "Satın Almacı",
    docs: "Talep Dokümanları",
    rules: "Satın Alma Talebi Kuralları",
  },
  satis: {
    entity: "Satış İlanı",
    entityLower: "satış ilanı",
    entityShort: "İlan",
    shortLower: "ilan",
    shortAcc: "İlanı",
    acc: "satış ilanını",
    gen: "satış ilanının",
    genCap: "İlanın",
    dat: "ilana",
    loc: "ilanda",
    pluralLoc: "satış ilanlarında",
    yours: "Satış ilanınız",
    yoursLower: "satış ilanınız",
    yoursAcc: "satış ilanınızı",
    yoursGen: "İlanınızın",
    yoursDat: "İlanınıza",
    scopeDesc: "Satış ilanının kapsamı",
    counterparty: "Alıcı",
    counterpartyPlural: "Alıcılar",
    counterpartyPluralLower: "alıcılar",
    counterpartyPluralGen: "Alıcıların",
    counterpartyPluralDat: "Alıcılara",
    owner: "Satış Sorumlusu",
    docs: "İlan Dokümanları",
    rules: "Teklif Kuralları",
  },
} as const;

export type EntityLabels = (typeof ENTITY_LABELS)[keyof typeof ENTITY_LABELS];

/** Sihirbaz/detay bileşenleri `isSatis` bayrağıyla çağırır. */
export function entityLabels(isSatis: boolean): EntityLabels {
  return isSatis ? ENTITY_LABELS.satis : ENTITY_LABELS.satinalma;
}

/** Liste kolonu: kaydı açan kişi — iki portalda da nötr "Sorumlu". */
export const OWNER_COLUMN_LABEL = "Sorumlu";

export function listingTerms(type: ListingTermKey) {
  return LISTING_TERMS[type];
}

/** Rota → sidebar etiketi (tam eşleşme). Bulunamazsa null. */
const ROUTE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(PORTALS).flatMap((p) =>
    allPortalRoutes(p).map((item) => [item.href, item.label]),
  ),
);

export function routeLabel(href: string): string | null {
  return ROUTE_LABELS[href] ?? null;
}
