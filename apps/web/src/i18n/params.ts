import { DEFAULT_LOCALE, pickLocale, type Locale } from "@rothern/i18n";

/** `app/[locale]/**` sayfalarının aldığı `params` — Next 15'te Promise. */
export type LocaleParams = Promise<{ locale: string }>;

/** Segment değerini desteklenen dile indirger; geçersizse varsayılan (layout zaten 404 verir). */
export async function localeFromParams(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  return pickLocale(locale) ?? DEFAULT_LOCALE;
}
