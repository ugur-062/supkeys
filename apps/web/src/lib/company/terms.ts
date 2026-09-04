import { PORTALS, allPortalRoutes } from "@/lib/company/portals";

/**
 * KAYIT TİPİ SÖZLÜĞÜ — sayaç, arama kutusu ve boş-durum metinleri buradan.
 *
 * Tek iş nesnesi var (ALIM = satın alma talebi) ama İKİ bakış açısı: firma
 * kendi taleplerine "satın alma talebi", başkalarının taleplerine satış
 * portalından "açık talep" der. Satış ilanı (SATIS) özelliği kaldırıldı
 * (2026-09-04) — satış tarafı yalnız teklif verir.
 *
 * Türkçe notu: `talep` son sesi yumuşar (talebi/talebe). Bu yüzden çekimli
 * biçimler tek tek yazılır, kod ek YAPIŞTIRMAZ.
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
 * VARLIK SÖZLÜĞÜ — sihirbaz, talep detayı, liste satırı, boş durum ve rapor
 * lejantı metinleri YALNIZ buradan (2026-09-03, v2 denetimi).
 *
 * Türkçe hâller AÇIKÇA yazılır (kod ek yapıştırmaz): talep→talebi/talebin.
 * Tek varlık kaldı (satış ilanı 2026-09-04'te kaldırıldı); sözlük yine tek
 * kaynak — metin değişikliği tek satırdır.
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
} as const;

export type EntityLabels = (typeof ENTITY_LABELS)[keyof typeof ENTITY_LABELS];

/** Sihirbaz/detay bileşenleri buradan okur. */
export function entityLabels(): EntityLabels {
  return ENTITY_LABELS.satinalma;
}

/** Liste kolonu: kaydı açan kişi — nötr "Sorumlu". */
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
