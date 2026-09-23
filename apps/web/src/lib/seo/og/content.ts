import { provinceDisplayName } from "@rothern/shared";
import { productPrice } from "@/lib/public/product-price";
import type { PublicListingDetail, PublicProduct, PublicProductCompany, PublicProfile } from "@/lib/public/marketplace-api";
import { joinParts } from "@/lib/seo/meta";
import { formatNumber, priceLabelsFor, webTranslator } from "@/i18n/server";
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";

/**
 * OG KARTI İÇERİĞİ — saf veri, JSX yok (SEO Parça 6).
 *
 * Her herkese açık sayfa paylaşıldığında (LinkedIn, WhatsApp, X, Slack) ve
 * üretken motorların kaynak kartlarında 1200×630 bir görsel ister. Görseli
 * olmayan sayfa metin bağlantısı olarak kalır — tıklanma yarı yarıya düşer.
 * Bu modül SAYFANIN OLGULARINI karta indirger; çizim `card.tsx`te.
 *
 * KURAL: `entities.ts` ile aynı — uydurma yok; veri yoksa satır yazılmaz.
 * İLAN SAHİBİ ANONİM: `listingOgContent` firma adını parametre olarak bile
 * almaz; `content.test.ts` çıktıyı tarar.
 */

export interface OgContent {
  /** Küçük üst etiket: "ÜRÜN", "FİRMA", "ALIM TALEBİ", "KATEGORİ", "ŞEHİR". */
  eyebrow: string;
  title: string;
  /** Başlığın altındaki tek satır (firma · şehir gibi). */
  subtitle: string | null;
  /** En fazla 3 olgu çipi (fiyat, MOQ, ürün sayısı…). */
  facts: string[];
  /** Sağ panelde gösterilecek görsel (mutlak URL) — yoksa tipografik kart. */
  image: string | null;
  /** Küçük rozet: "Doğrulanmış firma", "Teklife açık". */
  badge: string | null;
}

const MAX_TITLE = 90;

function clampTitle(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_TITLE) return flat;
  const cut = flat.slice(0, MAX_TITLE - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > MAX_TITLE * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function productOgContent(product: PublicProduct, company: PublicProductCompany, locale: Locale = DEFAULT_LOCALE): OgContent {
  const t = webTranslator(locale);
  const labels = priceLabelsFor(locale);
  const price = productPrice(product, labels);
  return {
    eyebrow: product.category?.name ? t("web.seo.og.productWith", { category: product.category.name.toLocaleUpperCase(locale) }) : t("web.seo.og.product"),
    title: clampTitle(product.name),
    subtitle: joinParts([company.name, provinceDisplayName(company.city, locale)], " · ") || null,
    facts: [
      price.hasPrice ? price.headline : labels.onRequest,
      product.moq ? t("web.seo.og.minOrder", { n: product.moq, unit: product.unit }) : null,
      product.brand ? product.brand : null,
    ].filter((f): f is string => !!f),
    image: product.images[0] ?? null,
    badge: company.verified ? t("web.seo.og.verifiedSupplier") : null,
  };
}

export function companyOgContent(p: PublicProfile, locale: Locale = DEFAULT_LOCALE): OgContent {
  const t = webTranslator(locale);
  return {
    eyebrow: t("web.seo.og.company"),
    title: clampTitle(p.name),
    subtitle: joinParts([p.industry, provinceDisplayName(p.city, locale)], " · ") || null,
    facts: [
      p.productCount > 0 ? t("web.seo.productsInShowcase", { n: formatNumber(p.productCount, locale) }) : null,
      p.foundedYear ? t("web.seo.og.since", { year: p.foundedYear }) : null,
      p.employeeCount ? t("web.seo.og.employees", { n: p.employeeCount }) : null,
    ].filter((f): f is string => !!f),
    image: p.coverImageUrl ?? p.logoUrl ?? null,
    badge: p.verified ? t("web.seo.og.verifiedCompany") : null,
  };
}

/**
 * ALIM TALEBİ — sahibin adı/logosu YOK (CLAUDE.md § İLAN SAHİBİ ANONİM).
 * Konum ve nitelik kalır: "kim alıyor" değil "nerede, ne kadar".
 */
export function listingOgContent(l: PublicListingDetail, locale: Locale = DEFAULT_LOCALE): OgContent {
  const t = webTranslator(locale);
  const qty =
    l.itemSummary.totalQuantity && l.itemSummary.unit
      ? `${l.itemSummary.totalQuantity} ${l.itemSummary.unit}`
      : null;
  const open = l.status === "OPEN";
  return {
    eyebrow: t("web.seo.og.demand", { number: l.number }),
    title: clampTitle(l.title),
    subtitle: joinParts([l.categories[0]?.name, provinceDisplayName(l.company.city, locale)], " · ") || null,
    facts: [
      qty ? t("web.seo.qty", { qty }) : null,
      l.itemSummary.count > 1 ? t("web.seo.items", { n: l.itemSummary.count }) : null,
      l.closesAt && open ? t("web.seo.og.closes", { date: new Date(l.closesAt).toLocaleDateString(locale === "tr" ? "tr-TR" : locale === "ru" ? "ru-RU" : "en-GB") }) : null,
    ].filter((f): f is string => !!f),
    image: l.coverImageUrl ?? null,
    badge: open ? t("web.seo.og.open") : t("web.seo.og.closedBadge"),
  };
}

export function categoryOgContent(name: string, count: number, locale: Locale = DEFAULT_LOCALE): OgContent {
  const t = webTranslator(locale);
  return {
    eyebrow: t("web.seo.og.category"),
    title: clampTitle(name),
    subtitle: t("web.seo.og.categorySubtitle"),
    facts: count > 0 ? [t("web.seo.og.products", { n: formatNumber(count, locale) })] : [],
    image: null,
    badge: null,
  };
}

export function cityOgContent(kind: "products" | "companies", city: string, count: number, locale: Locale = DEFAULT_LOCALE): OgContent {
  const t = webTranslator(locale);
  const cityName = provinceDisplayName(city, locale);
  return {
    eyebrow: t("web.seo.og.city"),
    title: kind === "products" ? t("web.seo.og.cityProductsTitle", { city: cityName }) : t("web.seo.og.cityCompaniesTitle", { city: cityName }),
    subtitle: kind === "products" ? t("web.seo.og.cityProductsSub") : t("web.seo.og.cityCompaniesSub"),
    facts: count > 0 ? [kind === "products" ? t("web.seo.og.products", { n: formatNumber(count, locale) }) : t("web.seo.og.companies", { n: formatNumber(count, locale) })] : [],
    image: null,
    badge: null,
  };
}

export function brandOgContent(locale: Locale = DEFAULT_LOCALE): OgContent {
  const t = webTranslator(locale);
  return {
    eyebrow: t("web.seo.og.brandEyebrow"),
    title: t("web.seo.og.brandTitle"),
    subtitle: t("web.seo.og.brandSubtitle"),
    facts: [],
    image: null,
    badge: null,
  };
}

/** @deprecated dil bilmez; `brandOgContent(locale)` kullan. Türkçe kart. */
export const BRAND_OG: OgContent = brandOgContent(DEFAULT_LOCALE);
