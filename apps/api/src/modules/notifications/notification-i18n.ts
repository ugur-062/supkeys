import {
  DEFAULT_LOCALE,
  internalRoutePath,
  isLocale,
  matchInternalRoute,
  type Locale,
} from "@rothern/i18n";
import { localizeAppPath } from "../../common/company/app-routes";
import { translatorFor } from "../../common/i18n/i18n.service";
import {
  formatNotificationParams,
  listingTitleRefs,
  type NotificationParam,
  type NotificationParams,
} from "../../common/notifications/notification-params";

/**
 * BILDIRIM OKUYANIN DILINDE (2026-10-07, sahip bulgusu: "bildirimler dil
 * secimine gore degismiyor").
 *
 * Satir eskiden yalniz URETILMIS metni tasiyordu (yazma anindaki dilde) ve dil
 * degisince eski dilde kaliyordu. Artik satir metnin GIRDILERINI de saklar
 * (`Notification.i18n`): katalog anahtarlari + tipli parametreler + ic CTA
 * yolu. Okuma yolu (`renderStoredNotification`) satiri okuyanin GUNCEL diliyle
 * yeniden uretir. `title/body/ctaLabel/ctaUrl` kolonlari aynen yazilmaya devam
 * eder: eski satirlarin ve katalogdan dusmus anahtarlarin yedegi.
 */
export interface StoredNotificationI18n {
  /** Bicim surumu (ileride alan anlami degisirse okuma yolu ayirt etsin). */
  v: 1;
  titleKey?: string;
  bodyKey?: string;
  ctaLabelKey?: string;
  /** JSON guvenli tipli parametreler (`$date` ISO dizesi). */
  params?: NotificationParams;
  /** IC (Turkce, on eksiz) yol; mutlak adresse koken korunur. */
  ctaPath?: string;
}

/** Yazma yolunun verdigi girdiler (`InAppPayload` alt kumesi). */
export interface NotificationRenderInputs {
  titleKey?: string;
  bodyKey?: string;
  ctaLabelKey?: string;
  params?: NotificationParams;
  ctaPath?: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isScalar = (v: unknown): v is string | number =>
  typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/** Tek parametre -> JSON guvenli karsiligi (Date -> ISO); taninmayan -> null. */
function serializeParam(v: unknown): NotificationParam | null {
  if (isScalar(v)) return v;
  if (!isObj(v)) return null;
  if ("$date" in v) {
    const raw = v.$date;
    const d = raw instanceof Date ? raw : new Date(String(raw));
    // Gecersiz tarih bicimleyicide bos dize uretir; ayni sonucu saklariz.
    if (Number.isNaN(d.getTime())) return "";
    return {
      $date: d.toISOString(),
      ...(v.style === "date" || v.style === "dateTime" ? { style: v.style } : {}),
    };
  }
  if ("$money" in v) {
    if (!isScalar(v.$money)) return null;
    return {
      $money: v.$money,
      currency: typeof v.currency === "string" ? v.currency : "",
    };
  }
  if ("$number" in v) {
    if (!isScalar(v.$number)) return null;
    return {
      $number: v.$number,
      ...(typeof v.maxFractionDigits === "number"
        ? { maxFractionDigits: v.maxFractionDigits }
        : {}),
    };
  }
  if ("$listingTitle" in v) {
    if (typeof v.$listingTitle !== "string") return null;
    return {
      $listingTitle: v.$listingTitle,
      fallback: typeof v.fallback === "string" ? v.fallback : "",
    };
  }
  return null;
}

/**
 * Tipli parametreler -> JSON guvenli kopya (SAF). `JSON.parse(JSON.stringify(x))`
 * sonucu girdiyle AYNIDIR; okuma yolu ayni fonksiyonla DB'den geleni de
 * dogrular (bozuk/taninmayan deger sessizce dusurulur).
 */
export function serializeNotificationParams(
  params: unknown,
): NotificationParams | undefined {
  if (!isObj(params)) return undefined;
  const out: NotificationParams = {};
  for (const [k, v] of Object.entries(params)) {
    const s = serializeParam(v);
    if (s !== null) out[k] = s;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Yazilacak `i18n` degeri. Hic anahtar ve ic yol yoksa (duz metinli eski yol)
 * `null`: satir yeniden uretilemez, saklanan metin doner.
 */
export function toStoredI18n(
  p: NotificationRenderInputs,
): StoredNotificationI18n | null {
  if (!p.titleKey && !p.bodyKey && !p.ctaLabelKey && !p.ctaPath) return null;
  const hasKey = !!(p.titleKey || p.bodyKey || p.ctaLabelKey);
  const params = hasKey ? serializeNotificationParams(p.params) : undefined;
  return {
    v: 1,
    ...(p.titleKey ? { titleKey: p.titleKey } : {}),
    ...(p.bodyKey ? { bodyKey: p.bodyKey } : {}),
    ...(p.ctaLabelKey ? { ctaLabelKey: p.ctaLabelKey } : {}),
    ...(params ? { params } : {}),
    ...(p.ctaPath ? { ctaPath: p.ctaPath } : {}),
  };
}

/** DB'den gelen JSON -> dogrulanmis girdiler; taninmayan bicim -> null (eski satir gibi). */
export function parseStoredI18n(raw: unknown): StoredNotificationI18n | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const out: StoredNotificationI18n = { v: 1 };
  const titleKey = str(raw.titleKey);
  const bodyKey = str(raw.bodyKey);
  const ctaLabelKey = str(raw.ctaLabelKey);
  const ctaPath = str(raw.ctaPath);
  const params = serializeNotificationParams(raw.params);
  if (titleKey) out.titleKey = titleKey;
  if (bodyKey) out.bodyKey = bodyKey;
  if (ctaLabelKey) out.ctaLabelKey = ctaLabelKey;
  if (params) out.params = params;
  if (ctaPath) out.ctaPath = ctaPath;
  return out;
}

/** Saklanan girdilerdeki talep basligi basvurulari (sayfa basina TEK sorgu icin). */
export function storedListingTitleRefs(
  i18n: StoredNotificationI18n | null,
): string[] {
  return i18n ? listingTitleRefs(i18n.params) : [];
}

type LooseTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has?: (key: string) => boolean;
};

/**
 * Katalog anahtari -> metin; uretilemiyorsa `null` (cagiran saklanan metne
 * duser). ASLA firlatmaz, ASLA ham anahtar dondurmez: katalogdan silinmis
 * anahtar ve eksik ICU parametresi cevirmenin yedegini (anahtar yolu)
 * uretir; o da `null` sayilir.
 */
function safeText(
  key: string | undefined,
  values: Record<string, string | number> | undefined,
  locale: Locale,
): string | null {
  if (!key) return null;
  try {
    const t = translatorFor(locale) as unknown as LooseTranslator;
    if (typeof t.has === "function" && !t.has(key)) return null;
    // Bos sozluk bile olsa ICU bicimleyicisi kosar: parametresi eksik mesaj
    // ham "{title}" yer tutucusuyla donmek yerine cevirmen yedegine (anahtar)
    // duser, o da saklanan metne cevrilir.
    const out = t(key, values ?? {});
    if (typeof out !== "string" || out === "" || out === key) return null;
    return out;
  } catch {
    return null;
  }
}

const ABSOLUTE_URL = /^(https?:\/\/[^/?#]+)([/?#][\s\S]*)?$/i;
const LOCALE_PREFIX = /^\/([a-z]{2})(?=\/|$|\?|#)/;

/**
 * ESKI satirin saklanan `ctaUrl`'i (yazma anindaki dilde, on ekli DIS adres)
 * -> okuyanin dilindeki adres. Yalniz rota tablosunun (`ROUTE_PATHNAMES`)
 * TANIDIGI yollar cevrilir; taninmayan yol, goreli/`mailto:` adres ve
 * cozulemeyen her sey OLDUGU GIBI doner.
 */
export function relocalizeCtaUrl(
  url: string | null | undefined,
  locale: Locale,
): string | null {
  if (!url) return url ?? null;
  try {
    const abs = ABSOLUTE_URL.exec(url);
    const origin = abs ? abs[1]! : "";
    const outer = abs ? (abs[2] ?? "/") : url;
    if (!outer.startsWith("/") || outer.startsWith("//")) return url;
    const m = LOCALE_PREFIX.exec(outer);
    const source: Locale = m && isLocale(m[1]) ? m[1] : DEFAULT_LOCALE;
    const unprefixed = m && isLocale(m[1]) ? outer.slice(m[0].length) || "/" : outer;
    if (!unprefixed.startsWith("/")) return url;
    const inner = internalRoutePath(unprefixed, source);
    const pathOnly = /^[^?#]*/.exec(inner)?.[0] ?? inner;
    if (!matchInternalRoute(pathOnly)) return url;
    return localizeAppPath(`${origin}${inner}`, locale);
  } catch {
    return url;
  }
}

/** Okuma yolunun dokundugu kolonlar. */
export interface NotificationTextRow {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  i18n?: unknown;
}

export interface LocalizedNotificationText {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

/**
 * Satir -> okuyanin dilindeki metin (SAF). `i18n` varsa anahtarlardan yeniden
 * uretir (tipli tarih/tutar/sayi okuyanin dilinde, talep basligi `titles`ten,
 * CTA adresi okuyanin diline cevrilir); parca uretilemezse O PARCA icin
 * saklanan metin kalir. `i18n` yoksa (eski satir) metin aynen, adres
 * cevrilebiliyorsa okuyanin diline.
 */
export function renderStoredNotification(
  row: NotificationTextRow,
  locale: Locale,
  titles?: ReadonlyMap<string, string>,
): LocalizedNotificationText {
  const i18n = parseStoredI18n(row.i18n);
  if (!i18n) {
    return {
      title: row.title,
      body: row.body,
      ctaLabel: row.ctaLabel,
      ctaUrl: relocalizeCtaUrl(row.ctaUrl, locale),
    };
  }
  let values: Record<string, string | number> | undefined;
  try {
    values = formatNotificationParams(i18n.params, locale, titles);
  } catch {
    values = undefined;
  }
  let ctaUrl: string | null;
  try {
    ctaUrl = i18n.ctaPath
      ? localizeAppPath(i18n.ctaPath, locale)
      : relocalizeCtaUrl(row.ctaUrl, locale);
  } catch {
    ctaUrl = row.ctaUrl;
  }
  return {
    title: safeText(i18n.titleKey, values, locale) ?? row.title,
    body: safeText(i18n.bodyKey, values, locale) ?? row.body,
    ctaLabel: safeText(i18n.ctaLabelKey, values, locale) ?? row.ctaLabel,
    ctaUrl,
  };
}
