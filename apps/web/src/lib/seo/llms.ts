import { LOCALE_LABELS, LOCALES, localizedCountrySlug, type Locale } from "@rothern/i18n";
import { countryProductPath, isHiddenCategory } from "@rothern/shared";
import { localizePath } from "@/i18n/href";
import { OPERATOR } from "@/lib/company-info";
import { cityProductPath } from "@/lib/public/city";
import { MARKETPLACE_ROUTES, categoryHref } from "@/lib/public/marketplace";
import type { ProductFacets, PublicStats } from "@/lib/public/marketplace-api";
import type { SeoT } from "@/lib/seo/entities";
import { absoluteUrl } from "@/lib/seo/meta";

/**
 * /llms.txt + /llms-full.txt — ÜÇ DİLDE (2026-09-27 SEO/GEO denetimi).
 *
 * Eskiden iki dosya da yalnız Türkçeydi ve yalnız Türkçe adres veriyordu;
 * `/en/llms.txt` catch-all'a düşüp 404 dönüyordu. Üretken motorlar çoğunlukla
 * İngilizce okur → KÖK dosyalar (`/llms.txt`, `/llms-full.txt`) İNGİLİZCE ve
 * İngilizce adreslerle; her dil kendi sürümünü `/<dil>/llms.txt` adresinde
 * taşır (`/tr/llms.txt` dahil — kök İngilizce olduğu için Türkçe de ön ekli).
 * Her dosyanın sonunda öteki dillere bağlantı.
 *
 * Metin katalogda (`web.marketing.llms.*`, istemciye GİTMEZ); adresler sayfa
 * kanoniğiyle AYNI yardımcılardan (`localizePath`, ülke slug'ı o dilin adıyla).
 * Kurallar değişmez: gizli alan (talep sahibi, teklif sayısı, iletişim) açıkça
 * "yayımlanmaz" diye yazılır; `llms-full` yalnız GERÇEK uç sayılarını basar.
 */

/** Dil sürümünün adresi: kök İngilizce, diğerleri `/<dil>/…` (Türkçe dahil). */
export function llmsPath(file: "llms.txt" | "llms-full.txt", locale: Locale): string {
  return `/${locale}/${file}`;
}

function url(path: string, locale: Locale): string {
  return absoluteUrl(localizePath(path, locale));
}

/** Şema adresi: iç şablon → dilin dış biçimi, parametre yerine `<ad>` (ör. `/en/companies/<company-slug>`). */
function pattern(internal: string, slots: Record<string, string>, locale: Locale): string {
  let path = localizePath(internal, locale);
  for (const [sentinel, label] of Object.entries(slots)) path = path.replace(sentinel, `<${label}>`);
  return path;
}

function otherLanguages(file: "llms.txt" | "llms-full.txt", locale: Locale, t: SeoT): string[] {
  return [
    `## ${t("web.marketing.llms.hLanguages")}`,
    "",
    ...LOCALES.filter((l) => l !== locale).map((l) => `- [${LOCALE_LABELS[l]}](${absoluteUrl(llmsPath(file, l))})`),
    "",
  ];
}

export function buildLlmsTxt(locale: Locale, t: SeoT): string {
  const k = (key: string, values?: Record<string, string | number>) => t(`web.marketing.llms.${key}`, values);
  const productPattern = pattern("/firma/__c__/urun/__p__", { __c__: k("slugCompany"), __p__: k("slugProduct") }, locale);
  const profilePattern = pattern("/firma/__c__", { __c__: k("slugCompany") }, locale);
  const countryPattern = pattern("/urunler/ulke/__x__", { __x__: k("slugCountry") }, locale);
  const cityPattern = pattern("/urunler/sehir/__x__", { __x__: k("slugCity") }, locale);
  const lines = [
    "# Rothern",
    "",
    `> ${k("summary")}`,
    "",
    k("operator", { legalName: OPERATOR.legalName, address: OPERATOR.address }),
    k("languages", {
      enExample: localizePath(MARKETPLACE_ROUTES.products, "en"),
      trExample: localizePath(MARKETPLACE_ROUTES.products, "tr"),
      ruExample: localizePath(MARKETPLACE_ROUTES.products, "ru"),
    }),
    "",
    `## ${k("hSurfaces")}`,
    "",
    `- [${t("web.marketplace.labels.products")}](${url(MARKETPLACE_ROUTES.products, locale)}): ${k("surfaceProducts")}`,
    `- ${k("surfaceGeo", {
      countryPattern,
      countryExample: url(countryProductPath("DE"), locale),
      cityPattern,
    })}`,
    `- [${t("web.marketplace.labels.companies")}](${url(MARKETPLACE_ROUTES.companies, locale)}): ${k("surfaceCompanies", { profilePattern })}`,
    `- [${t("web.marketplace.labels.demands")}](${url(MARKETPLACE_ROUTES.demands, locale)}): ${k("surfaceDemands")}`,
    `- [${k("howItWorksLink")}](${url("/nasil-calisir", locale)}): ${k("surfaceHow")}`,
    `- [${k("aboutLink")}](${url("/hakkimizda", locale)}) · [${k("contactLink")}](${url("/iletisim", locale)})`,
    `- [${k("sitemapLink")}](${absoluteUrl("/sitemap.xml")})`,
    `- [${k("fullLink")}](${absoluteUrl(llmsPath("llms-full.txt", locale))})`,
    "",
    `## ${k("hRules")}`,
    "",
    k("rulesIntro"),
    "",
    `- ${k("ruleOwner")}`,
    `- ${k("ruleBids")}`,
    `- ${k("ruleItems")}`,
    `- ${k("ruleContact")}`,
    "",
    `## ${k("hFields")}`,
    "",
    `- ${k("fieldPrice")}`,
    `- ${k("fieldVerified")}`,
    `- ${k("fieldTax")}`,
    `- ${k("fieldProduct", { productPattern })}`,
    "",
    `## ${k("hContact")}`,
    "",
    `- ${k("support", { email: OPERATOR.supportEmail })}`,
    `- ${k("privacy", { email: OPERATOR.kvkkEmail })}`,
    "",
    ...otherLanguages("llms.txt", locale, t),
  ];
  return lines.join("\n");
}

export interface LlmsFullData {
  stats: Pick<PublicStats, "products" | "openDemands" | "categories">;
  /** Facet'ler BU DİLDE çekilmiş olmalı (kategori/şehir adları okuyucunun dilinde). */
  facets: Pick<ProductFacets, "categories" | "cities" | "countries">;
  faq: { q: string; a: string }[];
  /** Ülke adı bu dilde (`countryDisplayName`). */
  countryLabel: (code: string) => string;
  /** Üretim tarihi (ISO gün) — test sabitler. */
  today?: string;
}

export function buildLlmsFullTxt(locale: Locale, t: SeoT, data: LlmsFullData): string {
  const k = (key: string, values?: Record<string, string | number>) => t(`web.marketing.llms.${key}`, values);
  const count = (n: number) => t("web.seo.products", { n });
  const parts: string[] = [
    `# ${k("fullTitle")}`,
    "",
    `> ${k("fullIntro", { llmsUrl: absoluteUrl(llmsPath("llms.txt", locale)) })}`,
    "",
  ];

  /* Envanter (yalnız gerçek sayılar; firma sayısı YAZILMAZ — 2026-09-22 kararı). */
  const inv: string[] = [];
  if (data.stats.products > 0) inv.push(`- ${k("invProducts", { n: data.stats.products })}`);
  if (data.stats.openDemands > 0) inv.push(`- ${k("invDemands", { n: data.stats.openDemands })}`);
  if (data.stats.categories > 0) inv.push(`- ${k("invCategories", { n: data.stats.categories })}`);
  if (inv.length) {
    parts.push(`## ${k("hInventory")}`, "", ...inv, "", k("generatedAt", { date: data.today ?? new Date().toISOString().slice(0, 10) }), "");
  }

  // Gizli segment kategori listesine girmez (2026-10-09; sayfası 404, adı gösterilmez).
  const cats = data.facets.categories.filter((c) => c.count > 0 && !isHiddenCategory(c.id)).slice(0, 30);
  if (cats.length) {
    parts.push(`## ${k("hCategories")}`, "");
    for (const c of cats) parts.push(`- [${c.name}](${url(categoryHref(c), locale)}) — ${count(c.count)}`);
    parts.push("");
  }

  /* Şehirler (dünya geneli): API adı okuyucunun dilinde; yabancı şehirde ülke adı eklenir. */
  const cities = data.facets.cities.filter((c) => c.count > 0).slice(0, 30);
  if (cities.length) {
    parts.push(`## ${k("hCities")}`, "");
    for (const c of cities) {
      const name = c.name ?? c.city;
      const where = c.country && c.country !== "TR" ? `${name}, ${data.countryLabel(c.country)}` : name;
      parts.push(`- [${where}](${url(cityProductPath(c.city), locale)}) — ${count(c.count)}`);
    }
    parts.push("");
  }

  const countries = (data.facets.countries ?? []).filter((c) => c.count > 0 && localizedCountrySlug(c.country, locale)).slice(0, 30);
  if (countries.length) {
    parts.push(`## ${k("hCountries")}`, "");
    for (const c of countries) {
      parts.push(`- [${data.countryLabel(c.country)}](${url(countryProductPath(c.country), locale)}) — ${count(c.count)}`);
    }
    parts.push("");
  }

  parts.push(
    `## ${k("hAddresses")}`,
    "",
    `- ${k("addrProducts")}: ${url(MARKETPLACE_ROUTES.products, locale)}`,
    `- ${k("addrCompanies")}: ${url(MARKETPLACE_ROUTES.companies, locale)}`,
    `- ${k("addrDemands")}: ${url(MARKETPLACE_ROUTES.demands, locale)}`,
    `- ${k("addrProductPattern")}: ${absoluteUrl(pattern("/firma/__c__/urun/__p__", { __c__: k("slugCompany"), __p__: k("slugProduct") }, locale))}`,
    `- ${k("addrCompanyPattern")}: ${absoluteUrl(pattern("/firma/__c__", { __c__: k("slugCompany") }, locale))}`,
    `- ${k("addrDemandPattern")}: ${absoluteUrl(pattern("/talep/__d__", { __d__: k("slugDemand") }, locale))}`,
    `- ${k("sitemapLink")}: ${absoluteUrl("/sitemap.xml")}`,
    "",
  );

  /* SSS — sayfayla AYNI kaynak (`faqFlat(locale)`), bu dilde. */
  if (data.faq.length) {
    parts.push(`## ${k("hFaq")}`, "", k("faqFull", { url: url("/sss", locale) }), "");
    for (const f of data.faq) parts.push(`### ${f.q}`, "", f.a, "");
  }

  parts.push(...otherLanguages("llms-full.txt", locale, t));
  return parts.join("\n");
}

export const LLMS_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
} as const;
