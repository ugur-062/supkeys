import type { ApiTranslator, Locale } from "@rothern/i18n";
import { DEFAULT_LOCALE } from "@rothern/i18n";
import { createApiTranslator } from "@rothern/i18n/translator";
import type * as React from "react";

/**
 * E-posta şablonlarının çevirmeni — katalog ad alanı `email` (API çevirmeniyle
 * AYNI ağaç: `common + api + email`), dil ALICININ dili.
 *
 * Anahtar TİPLİ (katalogda olmayan anahtar derlemede kırmızı), değerler gevşek:
 * `use-intl`in ICU argüman çıkarımı JSON'dan gelen `string` tipinde çalışmaz,
 * `apps/api` `tApi` de aynı nedenle gevşek imza kullanır (tek fark: burada
 * `rich` de var, çünkü şablonlarda cümle içinde <b>/<optout> etiketi geçiyor).
 */
export type EmailMessageKey = Parameters<ApiTranslator>[0];

export type EmailValues = Record<string, string | number | Date>;

export type EmailRichValues = Record<
  string,
  string | number | Date | ((chunks: React.ReactNode) => React.ReactNode)
>;

export interface EmailTranslator {
  (key: EmailMessageKey, values?: EmailValues): string;
  rich(key: EmailMessageKey, values?: EmailRichValues): React.ReactNode;
}

const cache = new Map<Locale, EmailTranslator>();

/** Dil başına önbellekli çevirmen; dil verilmezse Türkçe (kaynak dil). */
export function emailT(locale: Locale = DEFAULT_LOCALE): EmailTranslator {
  let t = cache.get(locale);
  if (!t) {
    t = createApiTranslator(locale) as unknown as EmailTranslator;
    cache.set(locale, t);
  }
  return t;
}

export { DEFAULT_LOCALE };
export type { Locale };
