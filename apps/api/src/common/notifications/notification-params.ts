import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { affixCurrency, currencySymbol } from "@rothern/shared";
import { APP_TIME_ZONE } from "../company/invite-delivery";

/**
 * TİPLİ BİLDİRİM PARAMETRELERİ (2026-09-27, uluslararası denetim).
 *
 * Bildirim/e-posta metni ALICININ dilinde üretilir (`renderPayload`, listing/
 * sipariş/admin `notify`), ama parametreleri çağıran ÖNCEDEN biçimliyordu:
 * `toLocaleString("tr-TR")` → İngilizce e-postada "27 Eylül 2026", Rusça
 * e-postada "1.234,5"; bir kısmında saat dilimi de yoktu (sunucu UTC → tur
 * açılışı 3 saat kayık, ödeme vadesi bir gün önce). Artık çağıran HAM değeri
 * tipli bir nesneyle verir, biçim alıcı başına burada seçilir:
 *
 *   `{ $date: d, style: "dateTime" }`  → İstanbul duvar saati; en/ru'da " (GMT+3)"
 *   `{ $money: 1234.5, currency: "TRY" }` → "1.234,5 ₺" · "₺1,234.5" · "1 234,5 ₺"
 *   `{ $number: 12.5 }`                → alıcının sayı biçimi
 *   `{ $listingTitle: id, fallback }`  → talep başlığı alıcının dilinde
 *                                        (içerik çevirisi; yoksa kaynak başlık)
 *
 * Düz dize/sayı parametreler AYNEN geçer — eski çağrılar değişmeden çalışır.
 */
export type DateParamStyle = "date" | "dateTime";

export interface DateParam {
  $date: Date | string;
  /** "date": 27 Eylül 2026 · "dateTime": 27 Eylül 2026 14:30 (+ dilim, en/ru). */
  style?: DateParamStyle;
}
export interface MoneyParam {
  $money: number | string;
  /** ISO kodu; TRY "₺" basılır, diğerleri kod (bugünkü e-posta biçimi). */
  currency: string;
}
export interface NumberParam {
  $number: number | string;
  maxFractionDigits?: number;
}
export interface ListingTitleParam {
  /** Talep kimliği — başlık alıcının dilinde çevirisinden okunur. */
  $listingTitle: string;
  /** Kaynak başlık (çeviri yoksa ya da okunamazsa). */
  fallback: string;
}

export type NotificationParam =
  | string
  | number
  | DateParam
  | MoneyParam
  | NumberParam
  | ListingTitleParam;
export type NotificationParams = Record<string, NotificationParam>;

export const dateParam = (d: Date, style: DateParamStyle = "date"): DateParam => ({
  $date: d,
  style,
});
export const moneyParam = (
  amount: number | string | { toString(): string },
  currency: string,
): MoneyParam => ({
  $money: typeof amount === "number" ? amount : String(amount),
  currency,
});
export const numberParam = (n: number | string | { toString(): string }): NumberParam => ({
  $number: typeof n === "number" ? n : String(n),
});
export const listingTitleParam = (
  listingId: string,
  fallback: string,
): ListingTitleParam => ({ $listingTitle: listingId, fallback });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/* ---------------------------------------------------------------- */
/* Biçimleyiciler (dil başına önbellekli)                            */
/* ---------------------------------------------------------------- */

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(locale: Locale, style: DateParamStyle): Intl.DateTimeFormat {
  const key = `${locale}:${style}`;
  let f = dateFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      timeZone: APP_TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
      ...(style === "dateTime" ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
    dateFormatters.set(key, f);
  }
  return f;
}

const zoneFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  timeZoneName: "shortOffset",
});

/** Türkçe dışı dilde saat metnine eklenen dilim etiketi (" (GMT+3)") — web `zoneSuffix` aynası. */
export function zoneSuffix(locale: Locale, at: Date): string {
  if (locale === DEFAULT_LOCALE) return "";
  const label =
    zoneFmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT+3";
  return ` (${label})`;
}

/** Tarih — HER ZAMAN İstanbul duvar saatiyle (UTC sunucuda gün kaymasın). */
export function formatNotificationDate(
  d: Date,
  locale: Locale,
  style: DateParamStyle = "date",
): string {
  const s = dateFormatter(locale, style).format(d);
  return style === "dateTime" ? `${s}${zoneSuffix(locale, d)}` : s;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();
/** Sayı — alıcının (ya da istek) dilinde; en fazla 2 ondalık (tutarlar). */
export function formatAmount(
  n: number | string,
  locale: Locale,
  maxFractionDigits = 2,
): string {
  const key = `${locale}:${maxFractionDigits}`;
  let f = numberFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits });
    numberFormatters.set(key, f);
  }
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? f.format(v) : String(n);
}

/** Bildirimlerdeki para birimi sembolü — tek kaynak `@rothern/shared` (boş = TRY). */
export function currencyMark(currency: string | null | undefined): string {
  return currencySymbol(currency || "TRY");
}

/**
 * Tutar + sembol, dilin yazımıyla (`affixCurrency`: İngilizcede önde "₺1,234.5",
 * Türkçe/Rusçada sonda "1.234,5 ₺"). Mesajlar tek `{amount}` alır; sembolü
 * ayrı `{currency}` yer tutucusuyla sona yapıştırmak İngilizcede yanlıştı.
 */
export function formatMoney(
  amount: number | string,
  currency: string | null | undefined,
  locale: Locale,
): string {
  return affixCurrency(formatAmount(amount, locale), currency || "TRY", locale);
}

/* ---------------------------------------------------------------- */
/* Çözümleme                                                         */
/* ---------------------------------------------------------------- */

/** Parametrelerdeki talep başlığı başvuruları (çeviri okunacak kimlikler). */
export function listingTitleRefs(params: NotificationParams | undefined): string[] {
  if (!params) return [];
  const ids = new Set<string>();
  for (const v of Object.values(params)) {
    if (isObj(v) && typeof v.$listingTitle === "string" && v.$listingTitle) {
      ids.add(v.$listingTitle);
    }
  }
  return [...ids];
}

/**
 * Tipli parametreler → ICU'ya verilecek düz değerler (SAF). `titles` alıcının
 * dilindeki talep başlıkları (`ListingTitleResolver`); verilmezse kaynak başlık.
 */
export function formatNotificationParams(
  params: NotificationParams | undefined,
  locale: Locale,
  titles?: ReadonlyMap<string, string>,
): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" || typeof v === "number") {
      out[k] = v;
    } else if ("$date" in v) {
      const d = v.$date instanceof Date ? v.$date : new Date(v.$date);
      out[k] = Number.isNaN(d.getTime()) ? "" : formatNotificationDate(d, locale, v.style);
    } else if ("$money" in v) {
      out[k] = formatMoney(v.$money, v.currency, locale);
    } else if ("$number" in v) {
      out[k] = formatAmount(v.$number, locale, v.maxFractionDigits ?? 2);
    } else if ("$listingTitle" in v) {
      out[k] = titles?.get(v.$listingTitle) ?? v.fallback;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * Talep başlığı kaynağı — `ContentTranslationService.localizeListings` ile
 * yapısal uyumlu (servis sınıfı buraya import edilmez: common modül bağımlılığı
 * olmasın). Okuma yolu fail-open: tablo okunamazsa kalemler aynen döner.
 */
export interface ListingTitleSource {
  localizeListings<T extends { title: string }>(
    items: T[],
    ids: (string | null | undefined)[],
    locale: Locale,
  ): Promise<T[]>;
}

const TITLE_TTL_MS = 60_000;
const TITLE_CACHE_MAX = 2_000;

/**
 * Talep başlığını ALICININ dilinde çözer (içerik çevirisinin DONE satırı).
 * Kısa ömürlü önbellek (60 sn, dil × talep): kategori eşleşme duyurusu tek
 * olaydan yüzlerce e-posta üretir — her biri için ayrı sorgu atılmasın.
 * Çeviri yoksa (kaynak dilde alıcı, çeviri henüz gelmedi, AI kapalı) boş
 * döner → biçimleyici kaynak başlığı basar.
 */
export class ListingTitleResolver {
  private readonly cache = new Map<string, { at: number; value: Promise<string | null> }>();

  constructor(
    /** Tembel: DI parametre özelliği alan başlatıcıdan sonra atanabilir. */
    private readonly source: () => ListingTitleSource | undefined,
    private readonly ttlMs = TITLE_TTL_MS,
  ) {}

  async resolve(ids: readonly string[], locale: Locale): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const src = this.source();
    const unique = [...new Set(ids.filter(Boolean))];
    if (!src || unique.length === 0) return out;
    const now = Date.now();
    if (this.cache.size > TITLE_CACHE_MAX) {
      for (const [k, e] of this.cache) if (now - e.at > this.ttlMs) this.cache.delete(k);
      if (this.cache.size > TITLE_CACHE_MAX) this.cache.clear();
    }
    const keyOf = (id: string) => `${locale}:${id}`;
    const missing = unique.filter((id) => {
      const e = this.cache.get(keyOf(id));
      return !e || now - e.at > this.ttlMs;
    });
    if (missing.length > 0) {
      const batch = src
        .localizeListings(
          missing.map(() => ({ title: "" })),
          missing,
          locale,
        )
        .then((rows) => new Map(missing.map((id, i) => [id, rows[i]?.title || null] as const)))
        .catch(() => new Map<string, string | null>());
      for (const id of missing) {
        this.cache.set(keyOf(id), { at: now, value: batch.then((m) => m.get(id) ?? null) });
      }
    }
    for (const id of unique) {
      const title = await this.cache.get(keyOf(id))?.value;
      if (title) out.set(id, title);
    }
    return out;
  }

  /** Parametrelerde başlık başvurusu yoksa sorgu atmadan `undefined`. */
  async forParams(
    params: NotificationParams | undefined,
    locale: Locale,
  ): Promise<Map<string, string> | undefined> {
    const refs = listingTitleRefs(params);
    return refs.length > 0 ? this.resolve(refs, locale) : undefined;
  }
}
