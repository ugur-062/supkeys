import glossary from "./glossary.json";
import { type Locale } from "./locales";

export interface LocaleGlossary {
  banned?: string[];
  terms?: Record<string, string>;
  style?: string;
}

const GLOSSARY = glossary as unknown as Record<string, LocaleGlossary | string>;

export function glossaryFor(locale: Locale): LocaleGlossary {
  const entry = GLOSSARY[locale];
  return typeof entry === "object" && entry !== null ? entry : {};
}

/** Dilin yasaklı sözcükleri (ürün dili kuralı: TR "ihale", EN "tender", RU "тендер"). */
export function bannedTerms(locale: Locale): string[] {
  return glossaryFor(locale).banned ?? [];
}

/**
 * Yasaklı terim SÖZCÜK BAŞINDA aranır (ekli biçimler de yakalansın: "ihaleye",
 * "tenders"); "bartender" gibi içte geçenler yakalanmaz.
 */
export function findBannedTerm(text: string, locale: Locale): string | null {
  const lower = text.toLocaleLowerCase(locale);
  for (const term of bannedTerms(locale)) {
    const t = term.toLocaleLowerCase(locale);
    const re = new RegExp(`(^|[^\\p{L}])${escapeRegExp(t)}`, "u");
    if (re.test(lower)) return term;
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
