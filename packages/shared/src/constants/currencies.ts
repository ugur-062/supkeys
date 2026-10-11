/**
 * PARA BİRİMLERİ — TEK KAYNAK (2026-09-27, uluslararası tur).
 *
 * Prisma `Currency` enum'ıyla BİREBİR (API DTO'ları enum'dan doğrular; web
 * seçicileri, AI süzgeçleri ve kur işi bu listeden okur). Listeye giren para
 * birimi TCMB'nin günlük kur verdiği bir birim olmalı: ürün dizininin fiyat
 * süzgeci ve pano/rapor çevrimi TRY kuruna dayanır. KZT/UZS/PLN/CZK/HUF
 * TCMB'de yok — ikinci kur kaynağı gelince eklenir.
 *
 * Bir birim eklerken: Prisma enum'ı (+ migration, `ADD VALUE`), API
 * `fx-rates.ts` yedek kuru, web `CURRENCY_SYMBOL`.
 */
export const CURRENCY_CODES = [
  "TRY",
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
  "RUB",
  "AZN",
  "SEK",
  "NOK",
  "DKK",
  "BGN",
  "RON",
  "KRW",
  "SAR",
  "QAR",
  "KWD",
  "AUD",
  "CAD",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/**
 * Enum biçimi (`{ TRY: "TRY", … }`) — class-validator `@IsEnum` ve eski
 * `CurrencyDto.X` kullanımları için. Liste yine `CURRENCY_CODES`tan türer.
 */
export const CURRENCY_ENUM = Object.freeze(
  Object.fromEntries(CURRENCY_CODES.map((c) => [c, c])),
) as { readonly [K in CurrencyCode]: K };

/** TRY dışındaki birimler — TCMB'den günlük çekilenler. */
export const FOREIGN_CURRENCY_CODES = CURRENCY_CODES.filter(
  (c): c is Exclude<CurrencyCode, "TRY"> => c !== "TRY",
);

const CURRENCY_SET: ReadonlySet<string> = new Set(CURRENCY_CODES);

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === "string" && CURRENCY_SET.has(v);
}

/**
 * Oturumsuz ziyaretçinin varsayılan para birimi — ARAYÜZ DİLİNDEN (ülkesi
 * bilinmiyor; IP'den tahmin yok). Türkçe TRY, Rusça RUB, diğerleri USD.
 * Oturumlu firmada `defaultCurrencyForCountry(firma ülkesi)` kullanılır.
 */
export function currencyForLocale(locale: string | null | undefined): CurrencyCode {
  if (locale === "tr") return "TRY";
  if (locale === "ru") return "RUB";
  return "USD";
}

/**
 * Ürünün KARŞILAŞTIRILABİLİR birim fiyatı (kendi para biriminde) — ürün
 * dizininin fiyat süzgeci/sıralaması/histogramı bunu okur. Kartın başlığında
 * gösterilen fiyatla AYNI kural: sabit fiyatta tutarın kendisi, kademeli
 * fiyatta EN DÜŞÜK kademe ("…'dan başlayan"), teklifle fiyatta yok (null).
 */
export function comparableUnitPrice(p: {
  priceMode: string;
  priceAmount: unknown;
  priceTiers: unknown;
}): number | null {
  if (p.priceMode === "FIXED") {
    if (p.priceAmount == null) return null;
    const n = Number(p.priceAmount);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (p.priceMode === "TIERED" && Array.isArray(p.priceTiers)) {
    let best: number | null = null;
    for (const t of p.priceTiers) {
      const n = Number((t as { unitPrice?: unknown } | null)?.unitPrice);
      if (Number.isFinite(n) && n > 0 && (best == null || n < best)) best = n;
    }
    return best;
  }
  return null;
}

/**
 * Ürün fiyatının TRY karşılığı (`CompanyItem.priceAmountBase`). `rateToTry`
 * 1 birimin TRY değerini verir; kur bilinmiyorsa null → taban da null (ürün
 * fiyat süzgecine girmez, "fiyatsız" sayılır — uydurma kurla sıralamaz).
 */
export function productPriceBase(
  p: { priceMode: string; priceAmount: unknown; priceTiers: unknown; priceCurrency: string | null | undefined },
  rateToTry: (code: string) => number | null,
): number | null {
  const unit = comparableUnitPrice(p);
  if (unit == null) return null;
  const rate = rateToTry(p.priceCurrency || "TRY");
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(unit * rate * 100) / 100;
}

/**
 * PARA SEMBOLÜ — TEK KAYNAK (web + API + e-posta). Belirsiz sembol yok: JPY/
 * CNY "JP¥"/"CN¥", dolar ailesi ayrışır (USD "$", AUD "A$", CAD "CA$");
 * paylaşılan ya da sağdan-sola yazılan işaretler ("kr", "лв", "lei", "﷼",
 * "د.إ") yerine ISO kodu. `Record<CurrencyCode, …>` → yeni kod sembolsüz
 * derlenmez.
 */
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF",
  JPY: "JP¥",
  AED: "AED",
  CNY: "CN¥",
  RUB: "₽",
  AZN: "₼",
  SEK: "SEK",
  NOK: "NOK",
  DKK: "DKK",
  BGN: "BGN",
  RON: "RON",
  KRW: "₩",
  SAR: "SAR",
  QAR: "QAR",
  KWD: "KWD",
  AUD: "A$",
  CAD: "CA$",
};

/** Serbest dize kod → sembol (bilinmeyen kodda kodun kendisi). */
export function currencySymbol(code: string): string {
  return (CURRENCY_SYMBOLS as Record<string, string>)[code] ?? code;
}

/**
 * Biçimlenmiş sayıya para sembolünü DİLİN yazım kuralıyla ekler
 * (2026-09-27): İngilizcede sembol ÖNDE ("$1,200.00", "€208.2K"; harfli
 * kodda boşluklu "CHF 1,200.00"; eksi işareti sembolden önce "-€50.00"),
 * Türkçe ve Rusçada SONDA ("1.200,00 ₺", "1 200,00 ₽"). Eskiden her dilde
 * sonda basılıyordu — İngilizce okura "1,200.00 $" yabancı geliyordu.
 * Sayının kendisi çağıranın `Intl.NumberFormat`ıyla (dilin ayraçları) gelir.
 */
export function affixCurrency(formatted: string, code: string, locale: string | null | undefined): string {
  const sym = currencySymbol(code);
  // Kısa kod ("en") ya da BCP-47 ("en-US") kabul.
  if (!(locale ?? "").toLowerCase().startsWith("en")) return `${formatted} ${sym}`;
  const neg = /^[-−]/.test(formatted);
  const body = neg ? formatted.slice(1) : formatted;
  const gap = /^[A-Za-z]+$/.test(sym) ? " " : "";
  return `${neg ? "-" : ""}${sym}${gap}${body}`;
}
