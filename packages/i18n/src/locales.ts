/**
 * Desteklenen diller — TEK KAYNAK. Sıra = dil seçicideki sıra.
 *
 * Kaynak dil Türkçe: geliştirici yalnız `tr` kataloğuna yazar, diğer diller
 * `i18n:sync` akışından gelir (bkz. docs/plan-i18n.md).
 */
export const LOCALES = ["tr", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "tr";

/** Dilin KENDİ adıyla etiketi (dil seçici çevrilmez — kullanıcı kendi dilini tanısın). */
export const LOCALE_LABELS: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
  ru: "Русский",
};

/** next-intl'in varsayılan çerez adı — Faz 1 yönlendirme middleware'i de bunu okur. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Çerez ömrü (saniye) — 1 yıl. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Eksik anahtar düşüş zinciri (öncelik SOLDAN sağa: önce kendi dili, sonra
 * İngilizce, en son Türkçe). İngilizce kullanıcıya Türkçe düşmesi CI kapısıyla
 * (EN %100) yalnız geliştirmede görülür.
 */
export const FALLBACK_CHAIN: Record<Locale, readonly Locale[]> = {
  tr: ["tr"],
  en: ["en", "tr"],
  ru: ["ru", "en", "tr"],
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Serbest bir dil etiketini desteklenen dile indirger: `en-US` → `en`,
 * `EN` → `en`, bilinmeyen → null.
 */
export function pickLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/**
 * `Accept-Language` başlığını q-değerine göre sıralayıp ilk desteklenen dili
 * döner; hiçbiri yoksa varsayılan. Bozuk/boş başlık → varsayılan.
 */
export function negotiateLocale(
  acceptLanguage: string | null | undefined,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (!acceptLanguage) return fallback;
  const candidates = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: (tag ?? "").trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((c) => c.tag && c.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const c of candidates) {
    if (c.tag === "*") return fallback;
    const locale = pickLocale(c.tag);
    if (locale) return locale;
  }
  return fallback;
}
