import { foldSearchText } from "../helpers/search-fold";

/**
 * ÖLÇÜ BİRİMİ KATALOĞU — TEK KAYNAK (Faz 1).
 *
 * Sorun: `ListingItem.unit` serbest metindi ve arayüzde düz bir `<Input>`'tu.
 * "adet / Adet / ADET / ad / pcs" dört ayrı değer oluyordu → rapor gruplanmıyor,
 * Excel eşleşmiyor, teklif karşılaştırması birim tutarlılığını doğrulayamıyor,
 * üstelik "2,5 adet" gibi anlamsız miktarlar kabul ediliyordu.
 *
 * Tasarım kararları (bilinçli):
 *  · Liste KAPALI DEĞİL. Bilinmeyen birim `unitCode = null` + serbest metin
 *    olarak kabul edilir; kullanıcı uyarılır ama İŞİ ENGELLENMEZ. Kapalı liste
 *    veri kalitesini artırırdı ama "listede yok" durumunda kullanıcı ihale
 *    açamaz hale gelirdi.
 *  · SAP'nin malzeme-başına alternatif birim çevrim matrisi (MARM) ALINMADI.
 *    `toBase` yalnız BOYUT İÇİ global çevrim (ton→kg); kalem başına özel
 *    çevrim gerçek bir talep gelene kadar yazılmaz.
 *  · `decimals` gerçek bir doğrulama kazandırır: adet=0 → "2,5 adet" reddedilir.
 *  · BELİRSİZ alias'lar KASITLI OLARAK YOK. Örnek: "mt" Türkçe'de genelde
 *    "metre"/"metretül", uluslararası kullanımda "metric ton" demek. Birini
 *    seçmek gerçek bir siparişte sessizce yanlış birim üretirdi (3 mt çelik →
 *    3 ton mu 3 metre mi?). Böyle bir girdi `null` döner, serbest metin olarak
 *    saklanır ve kullanıcı uyarılır — belirsizliği KULLANICI çözer, biz değil.
 *    `units.spec.ts` alias çakışmasını test ediyor; yeni alias eklerken bak.
 */

export type UnitDimension =
  | "COUNT"
  | "MASS"
  | "LENGTH"
  | "AREA"
  | "VOLUME"
  | "TIME"
  | "PACKAGING"
  | "SERVICE";

export interface UnitDef {
  /** Kanonik kod — DB'ye bu yazılır. */
  code: string;
  /** Kullanıcıya gösterilen TR ad. */
  nameTr: string;
  /** Kısa sembol (tablo/PDF'te yer kazandırır). */
  symbol: string;
  dimension: UnitDimension;
  /** Miktarda anlamlı ondalık hane sayısı (adet=0). */
  decimals: number;
  /** Boyut içi temel birime çevrim çarpanı (ton→kg = 1000). Temel birim = 1. */
  toBase: number;
  /** Yazım/dil varyantları — TR-katlanmış eşleşir. */
  aliases: string[];
}

export const UNIT_DIMENSION_LABELS: Record<UnitDimension, string> = {
  COUNT: "Sayı",
  MASS: "Ağırlık",
  LENGTH: "Uzunluk",
  AREA: "Alan",
  VOLUME: "Hacim",
  TIME: "Süre",
  PACKAGING: "Ambalaj",
  SERVICE: "Hizmet",
};

export const UNITS: readonly UnitDef[] = [
  // ── Sayı ────────────────────────────────────────────────────────────────
  { code: "PCE", nameTr: "adet", symbol: "ad", dimension: "COUNT", decimals: 0, toBase: 1,
    aliases: ["adet", "ad", "pcs", "piece", "pc", "tane", "unit"] },
  { code: "PAIR", nameTr: "çift", symbol: "çift", dimension: "COUNT", decimals: 0, toBase: 2,
    aliases: ["cift", "çift", "pair"] },
  { code: "SET", nameTr: "set", symbol: "set", dimension: "COUNT", decimals: 0, toBase: 1,
    aliases: ["set", "takim", "takım", "kit"] },
  { code: "DZN", nameTr: "düzine", symbol: "dzn", dimension: "COUNT", decimals: 0, toBase: 12,
    aliases: ["duzine", "düzine", "dozen"] },

  // ── Ağırlık (temel: kg) ─────────────────────────────────────────────────
  { code: "KG", nameTr: "kilogram", symbol: "kg", dimension: "MASS", decimals: 3, toBase: 1,
    aliases: ["kg", "kilo", "kilogram"] },
  { code: "GRM", nameTr: "gram", symbol: "g", dimension: "MASS", decimals: 3, toBase: 0.001,
    aliases: ["g", "gr", "gram"] },
  { code: "TON", nameTr: "ton", symbol: "t", dimension: "MASS", decimals: 3, toBase: 1000,
    aliases: ["ton", "t", "tonne"] },

  // ── Uzunluk (temel: m) ──────────────────────────────────────────────────
  { code: "M", nameTr: "metre", symbol: "m", dimension: "LENGTH", decimals: 2, toBase: 1,
    aliases: ["m", "metre", "meter", "metretul", "metretül"] },
  { code: "CM", nameTr: "santimetre", symbol: "cm", dimension: "LENGTH", decimals: 2, toBase: 0.01,
    aliases: ["cm", "santim", "santimetre"] },
  { code: "MM", nameTr: "milimetre", symbol: "mm", dimension: "LENGTH", decimals: 2, toBase: 0.001,
    aliases: ["mm", "milimetre"] },
  { code: "KM", nameTr: "kilometre", symbol: "km", dimension: "LENGTH", decimals: 3, toBase: 1000,
    aliases: ["km", "kilometre"] },

  // ── Alan (temel: m²) ────────────────────────────────────────────────────
  { code: "M2", nameTr: "metrekare", symbol: "m²", dimension: "AREA", decimals: 2, toBase: 1,
    aliases: ["m2", "m²", "metrekare", "metre kare", "sqm"] },

  // ── Hacim (temel: m³) ───────────────────────────────────────────────────
  { code: "M3", nameTr: "metreküp", symbol: "m³", dimension: "VOLUME", decimals: 3, toBase: 1,
    aliases: ["m3", "m³", "metrekup", "metreküp", "metre kup", "cbm"] },
  { code: "LTR", nameTr: "litre", symbol: "L", dimension: "VOLUME", decimals: 3, toBase: 0.001,
    aliases: ["lt", "l", "litre", "liter"] },
  { code: "ML", nameTr: "mililitre", symbol: "mL", dimension: "VOLUME", decimals: 3, toBase: 0.000001,
    aliases: ["ml", "mililitre"] },

  // ── Ambalaj ─────────────────────────────────────────────────────────────
  { code: "PKT", nameTr: "paket", symbol: "pk", dimension: "PACKAGING", decimals: 0, toBase: 1,
    aliases: ["paket", "pk", "pack"] },
  { code: "BOX", nameTr: "kutu", symbol: "kutu", dimension: "PACKAGING", decimals: 0, toBase: 1,
    aliases: ["kutu", "box"] },
  { code: "CRT", nameTr: "koli", symbol: "koli", dimension: "PACKAGING", decimals: 0, toBase: 1,
    aliases: ["koli", "carton", "ctn"] },
  { code: "PAL", nameTr: "palet", symbol: "palet", dimension: "PACKAGING", decimals: 0, toBase: 1,
    aliases: ["palet", "pallet"] },
  { code: "ROL", nameTr: "rulo", symbol: "rulo", dimension: "PACKAGING", decimals: 0, toBase: 1,
    aliases: ["rulo", "roll", "top"] },
  { code: "BAG", nameTr: "çuval", symbol: "çuval", dimension: "PACKAGING", decimals: 0, toBase: 1,
    aliases: ["cuval", "çuval", "torba", "bag", "sack"] },
  { code: "DRM", nameTr: "varil", symbol: "varil", dimension: "PACKAGING", decimals: 0, toBase: 1,
    aliases: ["varil", "bidon", "drum"] },

  // ── Süre ────────────────────────────────────────────────────────────────
  { code: "HUR", nameTr: "saat", symbol: "sa", dimension: "TIME", decimals: 2, toBase: 1,
    aliases: ["saat", "sa", "hour", "hr", "h"] },
  { code: "DAY", nameTr: "gün", symbol: "gün", dimension: "TIME", decimals: 2, toBase: 24,
    aliases: ["gun", "gün", "day"] },
  { code: "MON", nameTr: "ay", symbol: "ay", dimension: "TIME", decimals: 2, toBase: 720,
    aliases: ["ay", "month"] },
  { code: "YER", nameTr: "yıl", symbol: "yıl", dimension: "TIME", decimals: 2, toBase: 8760,
    aliases: ["yil", "yıl", "year"] },

  // ── Hizmet ──────────────────────────────────────────────────────────────
  { code: "SRV", nameTr: "hizmet", symbol: "hizmet", dimension: "SERVICE", decimals: 0, toBase: 1,
    aliases: ["hizmet", "service", "is", "iş", "job"] },
  { code: "MDY", nameTr: "adam-gün", symbol: "adam-gün", dimension: "SERVICE", decimals: 2, toBase: 1,
    aliases: ["adam gun", "adam-gun", "adam gün", "adam-gün", "man day", "manday"] },
  { code: "TRP", nameTr: "sefer", symbol: "sefer", dimension: "SERVICE", decimals: 0, toBase: 1,
    aliases: ["sefer", "trip", "sevkiyat"] },
] as const;

/** Sihirbazda listenin başında sabitlenen, TR B2B'de en sık kullanılanlar. */
export const COMMON_UNIT_CODES = [
  "PCE", "KG", "M", "M2", "M3", "LTR", "TON", "PKT",
] as const;

const BY_CODE = new Map(UNITS.map((u) => [u.code, u]));

/** Alias → kod. Katlanmış anahtar; ad ve sembol de otomatik dahil. */
const BY_ALIAS = (() => {
  const m = new Map<string, string>();
  for (const u of UNITS) {
    for (const a of [u.code, u.nameTr, u.symbol, ...u.aliases]) {
      const k = foldSearchText(a);
      if (k && !m.has(k)) m.set(k, u.code);
    }
  }
  return m;
})();

export function getUnit(code: string | null | undefined): UnitDef | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}

/**
 * Serbest metni kanonik koda çevirir; tanınmazsa `null` (FAIL-OPEN by design —
 * çağıran metni olduğu gibi saklar ve kullanıcıyı uyarır, işi engellemez).
 */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = foldSearchText(String(raw).trim());
  if (!k) return null;
  return BY_ALIAS.get(k) ?? BY_ALIAS.get(k.replace(/[.\s]/g, "")) ?? null;
}

/** Gösterim etiketi: bilinen kodda katalog adı, aksi halde ham metin. */
export function unitLabel(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  return getUnit(code)?.nameTr ?? (fallback?.trim() || "—");
}

/**
 * Miktarın birim için anlamlı olup olmadığı. Bilinmeyen birimde her zaman
 * geçerli (kural uygulayamayız). `adet` gibi decimals=0 birimlerde 2,5 REDDEDİLİR.
 */
export function isQuantityValidForUnit(
  quantity: number,
  code: string | null | undefined,
): boolean {
  const u = getUnit(code);
  if (!u) return true;
  if (!Number.isFinite(quantity)) return false;
  const scaled = quantity * 10 ** u.decimals;
  // Kayan nokta toleransı: 0,1+0,2 gibi girdilerde yanlış ret üretmesin.
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Aynı boyuttaki birimler arası çevrim; boyut farklıysa `null`. */
export function convertUnit(
  value: number,
  fromCode: string,
  toCode: string,
): number | null {
  const a = getUnit(fromCode);
  const b = getUnit(toCode);
  if (!a || !b || a.dimension !== b.dimension) return null;
  return (value * a.toBase) / b.toBase;
}
