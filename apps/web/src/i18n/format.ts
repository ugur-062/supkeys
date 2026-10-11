import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { UNITS, normalizeUnit, type UnitDef } from "@rothern/shared";

/**
 * SAYI/PARA/YÜZDE BİÇİMİ — TEK KAYNAK (saf; sunucu ve istemci ortak).
 *
 * 2026-09-27 (uluslararası tur): panelde onlarca yer `"tr-TR"` sabitiyle
 * biçimliyordu → İngilizce arayüzde "208,2 B €" ("B" İngilizcede billion,
 * Türkçede bin) ve "12.500" gibi okuyucunun alışkanlığına ters sayılar.
 * Kural: `"tr-TR"` literali yalnız bu dosyada (ve dilin kendisi Türkçe olan
 * sözleşme/JSON-LD yerlerinde) geçer; `src/i18n/__tests__/no-hardcoded-intl-locale.test`
 * dosya sisteminden zorunlu tutar. İstemci bileşeni hook'ları kullanır
 * (`useFormatNumber`, `useFormatPercent`, `useFormatDate` — `@/i18n/domain`;
 * para `useFormatMoney` — `@/components/ui/money`).
 */

/** BCP-47 etiketleri — `Intl` API'leri ve `toLocaleString` için (tek kaynak). */
export const INTL_LOCALE: Record<Locale, string> = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };

/** Dil kodu → BCP-47 etiketi; bilinmeyen/boş değer varsayılan dile düşer. */
export function intlLocale(locale: string | null | undefined): string {
  return INTL_LOCALE[(locale ?? "") as Locale] ?? INTL_LOCALE[DEFAULT_LOCALE];
}

/**
 * Sayı ayraçları — ELLE sabit (Intl'den türetilmez): para girişi sunucuda da
 * çizilir ve sunucu/tarayıcı ICU farkı (Rusçada U+00A0 / U+202F) hidrasyon
 * uyuşmazlığı üretmesin. Rusça binlik ayracı bölünmez boşluk.
 */
export const NUMBER_SEPARATORS: Record<Locale, { group: string; decimal: "." | "," }> = {
  tr: { group: ".", decimal: "," },
  en: { group: ",", decimal: "." },
  ru: { group: " ", decimal: "," },
};

export function numberSeparators(locale: string | null | undefined): { group: string; decimal: "." | "," } {
  return NUMBER_SEPARATORS[(locale ?? "") as Locale] ?? NUMBER_SEPARATORS[DEFAULT_LOCALE];
}

/** Sayı biçimi (ICU `{n}` düz argümanı gruplamaz — "1234 firma" olurdu). Sunucu ve istemci ortak. */
export function formatNumber(
  n: number,
  locale: Locale | string = DEFAULT_LOCALE,
  opts?: Intl.NumberFormatOptions,
): string {
  return n.toLocaleString(intlLocale(locale), opts);
}

/**
 * Yüzde — değer YÜZDE biriminde (12 → TR "%12", EN "12%", RU "12 %").
 * Türkçe önek elle yazılınca ("%12") İngilizce/Rusça arayüzde ters duruyordu.
 */
export function formatPercent(
  pct: number,
  locale: Locale | string = DEFAULT_LOCALE,
  opts: { maximumFractionDigits?: number; minimumFractionDigits?: number; signDisplay?: "auto" | "always" | "exceptZero" | "never" } = {},
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: opts.maximumFractionDigits ?? 0,
    minimumFractionDigits: opts.minimumFractionDigits,
    signDisplay: opts.signDisplay,
  }).format(pct / 100);
}

/** Yalnız Türkçeye özgü harfler (İngilizce/Rusça metinde bulunmaz). */
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Metnin KENDİ diline uygun büyük harf — baş harf/rozet için. `tr-TR` ile
 * büyütmek Latin "i"yi "İ" yapıyordu ("ivan" → "İV"); arayüz dilini kullanmak
 * da yanlış olurdu (Türkçe arayüzde Rus adı, İngilizce arayüzde Türk adı).
 * Metinde Türkçe harf varsa Türkçe kural, yoksa dilden bağımsız büyütme.
 */
export function upperForText(text: string, source: string = text): string {
  return TURKISH_LETTERS.test(source) ? text.toLocaleUpperCase(INTL_LOCALE.tr) : text.toUpperCase();
}

/**
 * Ölçü biriminin katalog kaydı — kod önce, yoksa kayıtlı ad/simge/eşanlamlı
 * ("adet", "pcs", "шт"). Etiket (`useUnitLabel`/`unitLabelWith`) ve miktar
 * (`useQuantityLabel`/`quantityWith`) AYNI eşlemeyi kullanır.
 */
export function findUnitDef(unit: string | null | undefined, code?: string | null): UnitDef | undefined {
  if (code) {
    const byCode = UNITS.find((u) => u.code === code);
    if (byCode) return byCode;
  }
  if (!unit) return undefined;
  const direct = UNITS.find((u) => u.nameTr === unit || u.symbol === unit || u.code === unit);
  if (direct) return direct;
  const alias = normalizeUnit(unit);
  return alias ? UNITS.find((u) => u.code === alias) : undefined;
}

