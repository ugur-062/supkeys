import { provinceDisplayName } from "@rothern/shared";
import { findUnitDef, intlLocale } from "@/i18n/format";
import { localizePath } from "@/i18n/href";
import { countryDisplayName } from "@/i18n/domain";
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { TITLE_SUFFIX, fitTitle } from "./meta";
import { MARKETPLACE_ROUTES, categoryHref, listingHref } from "@/lib/public/marketplace";
import { productPrice, type PriceLabels } from "@/lib/public/product-price";
import { SITE_ID, breadcrumbNode, compact, graph, type JsonLdNode } from "@/lib/seo/jsonld";
import {
  absoluteUrl,
  buildMetadata,
  clampDescription,
  contentLangOf,
  joinParts,
  LANG_TAG,
  ogCardPath,
  readyLocalesOf,
} from "@/lib/seo/meta";
import type { Metadata } from "next";

/**
 * VARLIK SAYFALARININ SEO/GEO ÜRETİMİ — TEK KAYNAK (2026-09-09, Parça 2).
 *
 * Buradaki her fonksiyon aynı üçlüyü döndürür: `metadata` (başlık/açıklama/
 * kanonik/OG), `jsonLd` (yapılandırılmış veri) ve `summary` (sayfanın ne
 * olduğunu söyleyen TEK CÜMLE). Üçü de AYNI olgulardan türer — ayrı ayrı
 * yazılsalardı başlıkta olan bilgi açıklamada olmaz, açıklamada olan
 * yapılandırılmış veride bulunmazdı.
 *
 * `summary` GEO'nun asıl aracıdır: üretken motorlar sayfanın başındaki net
 * tanım cümlesini alıntılar. Cümle SAYFADA DA görünür (Parça 4) — yalnız
 * meta etiketinde duran bir tanım hem yönergelere aykırı hem kullanıcıya
 * faydasızdır.
 *
 * KURAL: hiçbir alan uydurulmaz. Veri yoksa cümlenin o parçası HİÇ yazılmaz
 * (`joinParts` boşları atar) — "fiyat: belirtilmemiş" gibi doldurma yapılmaz.
 * Kapılı alan (ilan sahibinin adı, firma iletişimi, teklifler) buraya
 * PARAMETRE OLARAK BİLE geçmez; sözleşme testi çıktıyı tarar.
 *
 * ÇOK DİLLİ GRAF (2026-09-27 SEO denetimi): her sayfada İKİ düğüm —
 *   · SAYFA düğümü (`ItemPage`/`ProfilePage`): `@id`/`url` = o dilin adresi,
 *     `inLanguage`, `isPartOf` (site), `mainEntity`, `dateModified`;
 *   · VARLIK düğümü (`Product`/`Organization`/`Demand`): `@id` DİLDEN
 *     BAĞIMSIZ (Türkçe kanonik + `#product`/`#company`/`#demand`) — üç dil
 *     sayfası AYNI varlığı anlatır, üç ayrı firma/ürün değil. `inLanguage`
 *     bu tiplerde geçerli bir özellik DEĞİL, yalnız sayfa düğümünde.
 * Varlık düğümü grafta İLK sırada kalır (testler ve tüketiciler onu okur).
 */

/** Dilden bağımsız varlık kimlikleri — Türkçe (ön eksiz) kanonik + parça. */
export const entityId = {
  product: (companySlug: string, productSlug: string) => `${absoluteUrl(`/firma/${companySlug}/urun/${productSlug}`)}#product`,
  company: (slug: string) => `${absoluteUrl(`/firma/${slug}`)}#company`,
  demand: (path: string) => `${absoluteUrl(path)}#demand`,
};

/** ISO ülke kodu mu (`addressCountry`) — boş/serbest metin yazılmaz, "TR" UYDURULMAZ. */
function isoCountry(code: string | null | undefined): string | undefined {
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/* ------------------------------------------------------------------ */
/* Ürün                                                                */
/* ------------------------------------------------------------------ */

export interface ProductSeoInput {
  companySlug: string;
  product: {
    name: string;
    slug: string;
    description: string | null;
    images: string[];
    brand: string | null;
    mpn: string | null;
    unit: string;
    /** Katalog birimi — varsa etiket okuyucunun dilinde (`web.domain.unit.<KOD>`). */
    unitCode?: string | null;
    moq: string | null;
    priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
    priceAmount: string | null;
    priceTiers: { minQty: number; unitPrice: number }[] | null;
    priceCurrency: string;
    category?: { id: string; name: string } | null;
    /** Kategorinin segmenti (L1) — kırıntı segment açılış sayfasına bağlanır. */
    segment?: { id: string; name: string; slug?: string } | null;
    attributeList?: { label: string; value: string; unit: string | null }[];
    keywords?: string[];
    updatedAt?: string | null;
    /** Dil durumu (API): hreflang yalnız hazır diller; kaynak dilde gösterimde `inLanguage`. */
    readyLocales?: string[];
    sourceLocale?: string;
  };
  company: {
    name: string;
    slug: string | null;
    city: string | null;
    country: string | null;
    industry: string | null;
  };
  /** Pazar yeri anahtarı kapalıyken sayfa görünür ama indekslenmez. */
  indexable: boolean;
}

/**
 * Gevşek anahtarlı çevirmen — üreticiler bunu PARAMETRE alır. Sunucuda
 * `seoT(locale)` (i18n/server.ts, `server-only`), istemcide `useSeoT()`
 * (i18n/domain.ts). Bu modül `@/i18n/server`ı İMPORT ETMEZ: ürün/talep
 * detay bileşenleri ve panel formlarının parçacık önizlemesi istemcide de
 * çalışıyor; `server-only` zinciri derlemeyi kırar (2026-09-23, staging).
 */
export type SeoT = (key: string, values?: Record<string, string | number | Date>) => string;

function priceLabels(t: SeoT, locale: Locale): PriceLabels {
  return {
    locale: intlLocale(locale),
    onRequest: t("web.marketplace.price.onRequest"),
    fromQty: (n, unit, code) => t("web.marketplace.price.fromQty", { qty: quantityWith(t, n, unit, code) }),
  };
}

/**
 * Ölçü birimi etiketi OKUYUCUNUN DİLİNDE (istemci `useUnitLabel` ile aynı
 * eşleme): kod ya da Türkçe ad/simge katalogdaysa `web.domain.unit.<KOD>`,
 * değilse özgün metin (kodsuz serbest birim zaten içerik çevirisinden gelir).
 * Eskiden meta açıklaması ve OG fiyatı EN sayfada "… / adet" basıyordu.
 */
export function unitLabelWith(t: SeoT, unit: string | null | undefined, code?: string | null): string {
  const known = findUnitDef(unit, code);
  return known ? t(`web.domain.unit.${known.code}`) : (unit ?? "");
}

/**
 * Miktar + birim DİLİN ÇOĞUL KURALIYLA (`web.domain.qty.<KOD>`): "100 pieces",
 * "100 коробок", "100 adet". Tekil etiketi sayının yanına yapıştırmak EN/RU'da
 * "100 piece" / "100 коробка" basıyordu (2026-09-27). Kodsuz serbest birimde
 * sayı + metin (`qty.other`).
 */
export function quantityWith(t: SeoT, n: number | string, unit: string | null | undefined, code?: string | null): string {
  const num = Number(n);
  const known = findUnitDef(unit, code);
  if (!Number.isFinite(num)) return [String(n), unitLabelWith(t, unit, code)].filter(Boolean).join(" ");
  return known
    ? t(`web.domain.qty.${known.code}`, { n: num })
    : t("web.domain.qty.other", { n: num, unit: unit ?? "" });
}

function priceSentence(p: ProductSeoInput["product"], locale: Locale, t: SeoT, unit: string): string {
  const labels = priceLabels(t, locale);
  const price = productPrice({ ...p, unit }, labels);
  if (price.hasPrice) return price.headline;
  return labels.onRequest;
}

/**
 * Teklif düğümü — YALNIZ gerçek fiyat varsa (2026-09-27): fiyatsız `Offer`
 * ("teklif isteyin") ya da stok bilmeden yazılan `InStock` Rich Results
 * hatasıdır ve uydurmadır. Sabit fiyat → `Offer.price`; kademeli → en düşük/
 * en yüksek birim fiyatlı `AggregateOffer` (+ kademeler `priceSpecification`).
 */
function offerNode(
  pr: ProductSeoInput["product"],
  url: string,
  unit: string,
  seller: JsonLdNode,
): JsonLdNode | undefined {
  const moq = pr.moq
    ? { eligibleQuantity: { "@type": "QuantitativeValue", minValue: Number(pr.moq) || undefined, unitText: unit } }
    : {};
  // 0 fiyat "gerçek fiyat" değildir (derin denetim LU-08): API artık 0'ı
  // reddediyor ama eski kayıtta "0" string'i truthy olduğundan Google'a
  // ücretsiz ürün olarak Offer price=0 yazılıyordu.
  if (pr.priceMode === "FIXED" && Number(pr.priceAmount) > 0) {
    return compact({ "@type": "Offer", url, price: pr.priceAmount, priceCurrency: pr.priceCurrency, ...moq, seller });
  }
  if (pr.priceMode === "TIERED" && pr.priceTiers?.length && pr.priceTiers.every((t) => Number(t.unitPrice) > 0)) {
    const prices = pr.priceTiers.map((t) => t.unitPrice);
    return compact({
      "@type": "AggregateOffer",
      url,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      priceCurrency: pr.priceCurrency,
      offerCount: pr.priceTiers.length,
      priceSpecification: pr.priceTiers.map((t) => ({
        "@type": "UnitPriceSpecification",
        price: t.unitPrice,
        priceCurrency: pr.priceCurrency,
        eligibleQuantity: { "@type": "QuantitativeValue", minValue: t.minQty, unitText: unit },
      })),
      ...moq,
      seller,
    });
  }
  return undefined;
}

export interface SeoOptions {
  /** Sayfanın dili (i18n Faz 1) — kanonik/hreflang ve JSON-LD adresi bu dilin. */
  locale?: Locale;
  /** Çevirmen: sunucuda `seoT(locale)`, istemcide `useSeoT()`. */
  t: SeoT;
}

export function productSeo(input: ProductSeoInput, opts: SeoOptions): {
  metadata: Metadata;
  jsonLd: JsonLdNode;
  summary: string;
} {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  const ts = opts.t;
  const { product: pr, company: co, companySlug } = input;
  const path = `/firma/${companySlug}/urun/${pr.slug}`;
  const url = absoluteUrl(localizePath(path, locale));
  const images = pr.images.map((i) => (i.startsWith("http") ? i : absoluteUrl(i)));
  const where = joinParts([co.name, provinceDisplayName(co.city, locale)], ", ");
  const unit = unitLabelWith(ts, pr.unit, pr.unitCode);
  const minOrder = pr.moq ? ts("web.seo.og.minOrder", { qty: quantityWith(ts, pr.moq, pr.unit, pr.unitCode) }) : null;

  /* Tanım cümlesi: NE + KİM + NEREDE + FİYAT + MOQ. Arama sonucunda ve AI
     cevabında tek başına anlamlı olmalı — "ürün sayfası" demek yetmez. */
  const summary = joinParts(
    [
      joinParts([pr.name, pr.category?.name], " — "),
      where ? ts("web.seo.inShowcaseOf", { where }) : null,
      priceSentence(pr, locale, ts, unit),
      minOrder,
    ],
    " · ",
  );

  /* Satıcının KENDİ metni varsa açıklamanın başında durur: özgün içerik hem
     sıralamada hem alıntıda şablon cümleden değerlidir. Olgular arkaya
     eklenir; 160'ta kelime sınırında kesilir. */
  const lead = pr.description ? clampDescription(pr.description, 96) : null;
  const description = clampDescription(joinParts([lead, priceSentence(pr, locale, ts, unit), minOrder, where], " · "));

  // Başlık tavanı 75 (canlı denetim 2026-09-11: 83 karakterlik ürün adı taşıyordu):
  // önce firma adı düşer, yine uzunsa ürün adı kelime sınırında kısaltılır.
  const title = clampTitle(pr.name, co.name);
  const productId = entityId.product(companySlug, pr.slug);

  /* Satıcı kimliği ÜRÜNDE açıktır (ilan sahibinin tersine): ürün sayfası
     firmanın opt-in vitrinidir ve adı sayfada zaten yazılı. Adres okuyucunun
     dilinde, kimlik dilden bağımsız (firma sayfasındaki `Organization`la aynı). */
  const seller = compact({
    "@type": "Organization",
    ...(co.slug ? { "@id": entityId.company(co.slug), url: absoluteUrl(localizePath(`/firma/${co.slug}`, locale)) } : {}),
    name: co.name,
    ...(co.city
      ? {
          address: compact({
            "@type": "PostalAddress",
            addressLocality: provinceDisplayName(co.city, locale),
            addressCountry: isoCountry(co.country),
          }),
        }
      : {}),
  });

  const productNode = compact({
    "@type": "Product",
    "@id": productId,
    name: pr.name,
    url,
    description: pr.description ?? summary,
    image: images,
    ...(pr.category?.name ? { category: pr.category.name } : {}),
    ...(pr.brand ? { brand: { "@type": "Brand", name: pr.brand } } : {}),
    ...(pr.mpn ? { mpn: pr.mpn } : {}),
    ...(pr.keywords?.length ? { keywords: pr.keywords.join(", ") } : {}),
    ...(pr.attributeList?.length
      ? {
          additionalProperty: pr.attributeList.map((a) => ({
            "@type": "PropertyValue",
            name: a.label,
            value: a.unit ? `${a.value} ${a.unit}` : a.value,
          })),
        }
      : {}),
    offers: offerNode(pr, url, unit, seller),
    mainEntityOfPage: { "@id": url },
  });

  const pageNode = compact({
    "@type": "ItemPage",
    "@id": url,
    url,
    name: title,
    description,
    inLanguage: contentLangOf(pr, locale) ?? LANG_TAG[locale],
    isPartOf: { "@id": SITE_ID() },
    mainEntity: { "@id": productId },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    ...(images[0] ? { primaryImageOfPage: { "@type": "ImageObject", url: images[0] } } : {}),
    ...(pr.updatedAt ? { dateModified: pr.updatedAt } : {}),
  });

  return {
    metadata: buildMetadata({
      title,
      description,
      path,
      // Ürün fotoğrafı yoksa (yayın kapısı ≥1 ister; önizleme/eski kayıt)
      // ürünün KENDİ kartı — marka kartı değil.
      images: images.length ? images.slice(0, 1) : [ogCardPath(path, locale)],
      noindex: !input.indexable,
      locale: opts.locale,
      locales: readyLocalesOf(pr.readyLocales),
    }),
    jsonLd: graph([
      productNode,
      pageNode,
      {
        "@id": `${url}#breadcrumb`,
        ...breadcrumbNode([
          { name: ts("web.marketing.breadcrumbHome"), path: "/" },
          { name: ts("web.marketplace.labels.products"), path: MARKETPLACE_ROUTES.products },
          // Kırıntı SEGMENT açılış sayfasına (2026-09-27): L3 kodu süzgeç
          // adresine düşüyordu (`/en/products?kategori=…`, kanoniği dizin).
          ...(pr.segment ? [{ name: pr.segment.name, path: categoryHref(pr.segment) }] : []),
          { name: co.name, path: `/firma/${companySlug}` },
          { name: pr.name, path },
        ], locale),
      },
    ]),
    summary,
  };
}

/* ------------------------------------------------------------------ */
/* Firma                                                               */
/* ------------------------------------------------------------------ */

export interface CompanySeoInput {
  slug: string;
  name: string;
  industry: string | null;
  city: string | null;
  country: string | null;
  aboutText: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  foundedYear: number | null;
  employeeCount: string | null;
  categories: { id: string; name: string }[];
  certifications?: string[];
  verified?: boolean;
  productCount: number;
  /** Vitrindeki ilk ürünler — katalog düğümü için (ad + yol). */
  products?: { name: string; slug: string }[];
  /**
   * Dış kimlik (Parça 7, kullanıcı kararı 2026-09-09): firmanın kendi web
   * sitesi ve LinkedIn sayfası `sameAs` olur — motor Rothern profilini
   * firmanın gerçek varlığına bağlar (Knowledge Graph / varlık tanıma).
   * Yalnız http(s) adresler; boş/geçersiz olan yazılmaz.
   */
  website?: string | null;
  linkedinUrl?: string | null;
  /** Kalite kapısı (API `indexable`) — `false` ise `noindex`. Verilmezse indekslenebilir. */
  indexable?: boolean;
  updatedAt?: string | null;
  /** Dil durumu (API): hreflang yalnız hazır diller. */
  readyLocales?: string[];
  sourceLocale?: string;
  /**
   * Sayfada basılan hizmet çipleri — tanıtım ve sektörle birlikte firmanın
   * ÇEVRİLEN üç alanından biri (`companyContentLang`). Verilmezse yok sayılır.
   */
  services?: string[];
}

/**
 * Firma sayfasında KAYNAK dilde basılan metnin dili — `ProfilePage.inLanguage`
 * bunu söyler (kural: sayfa düğümü sayfanın dilini taşır; kaynak dilde
 * gösterilen içerik varsa onun dilini — `contentLangOf`).
 *
 * Firmada çevrilen metin YOKSA (tanıtım, sektör, hizmet — içerik çevirisinin
 * üç alanı) sayfada kaynak dilde basılan hiçbir şey de yoktur: ad özel isim,
 * geri kalan her şey arayüz dilinde. O durumda `undefined` → sayfanın dili.
 * Eskiden yalnız dil durumuna bakılıyordu: çeviri satırı olmayan kayıt için API
 * "hazır: tr, kaynak: tr" varsayar (`readyLocales`), bu da metinsiz her yeni
 * firmanın EN/RU sayfasına — sahibi Türkiye'de olmasa bile — `inLanguage: "tr"`
 * yazdırıyordu (arayüz testi D-05). Dil durumunun kendisi (hreflang, kanonik,
 * `noindex`) DEĞİŞMEZ: onlar `readyLocales` / `indexable`dan okunur.
 */
export function companyContentLang(
  c: Pick<CompanySeoInput, "aboutText" | "industry" | "services" | "readyLocales" | "sourceLocale">,
  locale: Locale,
): string | undefined {
  const hasText = [c.aboutText, c.industry, ...(c.services ?? [])].some((v) => !!v?.trim());
  return hasText ? contentLangOf(c, locale) : undefined;
}

function httpUrls(values: (string | null | undefined)[]): string[] {
  return values.filter((v): v is string => !!v && /^https?:\/\//i.test(v.trim())).map((v) => v.trim());
}

export function companySeo(c: CompanySeoInput, opts: SeoOptions): {
  metadata: Metadata;
  jsonLd: JsonLdNode;
  summary: string;
} {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  const ts = opts.t;
  const path = `/firma/${c.slug}`;
  const url = absoluteUrl(localizePath(path, locale));

  const summary = joinParts(
    [
      joinParts([c.name, c.industry], " — "),
      c.city ? ts("web.seo.basedIn", { city: provinceDisplayName(c.city, locale) }) : null,
      c.productCount > 0 ? ts("web.seo.productsInShowcase", { n: c.productCount }) : null,
      c.verified ? ts("web.seo.verifiedOnRothern") : null,
    ],
    " · ",
  );

  const lead = c.aboutText ? clampDescription(c.aboutText, 100) : null;
  // Hakkında metni ve sektör/şehir boşken açıklama 30 karaktere düşüyordu
  // (canlı denetim 2026-09-11) — parçacık için en az ~50: genel cümle eklenir.
  const parts = [
    lead,
    joinParts([c.industry, provinceDisplayName(c.city, locale)], ", "),
    c.productCount > 0 ? ts("web.seo.products", { n: c.productCount }) : null,
    ts("web.seo.companyProfile"),
  ];
  const base = joinParts(parts, " · ");
  const description = clampDescription(
    base.length >= 50 ? base : `${base} ${ts("web.seo.exploreTail")}`,
  );

  // JSON-LD görsel/logo MUTLAK adres ister: kapak çoğu zaman göreli yedek
  // (`/categories/72000000.webp`) — arayüz testi D-080.
  const toAbs = (u: string) => (/^https?:\/\//.test(u) ? u : absoluteUrl(u));
  const logo = c.logoUrl ? toAbs(c.logoUrl) : null;
  const image = c.coverImageUrl ? toAbs(c.coverImageUrl) : logo;
  const companyId = entityId.company(c.slug);
  const title = companyTitle(c.name, c.industry, provinceDisplayName(c.city, locale));

  const orgNode = compact({
    "@type": "Organization",
    "@id": companyId,
    name: c.name,
    url,
    description: c.aboutText ?? summary,
    ...(logo ? { logo } : {}),
    ...(image ? { image } : {}),
    ...(c.foundedYear ? { foundingDate: String(c.foundedYear) } : {}),
    /* `employeeCount` bir ARALIK ("11-50") — sayı değil. Şemaya sayı gibi
       yazmak yanlış veri olurdu; `QuantitativeValue.name` metni taşır. */
    ...(c.employeeCount ? { numberOfEmployees: { "@type": "QuantitativeValue", name: c.employeeCount } } : {}),
    ...(c.categories.length ? { knowsAbout: c.categories.map((k) => k.name) } : {}),
    ...(c.certifications?.length ? { hasCredential: c.certifications } : {}),
    ...(httpUrls([c.website, c.linkedinUrl]).length ? { sameAs: httpUrls([c.website, c.linkedinUrl]) } : {}),
    /* Adres: ülke yalnız ISO kodu varsa (eskiden yoksa "TR" UYDURULUYORDU).
       `areaServed` YAZILMAZ: firmanın merkez ülkesi hizmet bölgesi değildir
       ve eskiden ham kod ("DE") ad olarak basılıyordu (2026-09-27). */
    ...(c.city
      ? {
          address: compact({
            "@type": "PostalAddress",
            addressLocality: provinceDisplayName(c.city, locale),
            addressCountry: isoCountry(c.country),
          }),
        }
      : {}),
    ...(c.products?.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: ts("web.seo.productsOf", { name: c.name }),
            itemListElement: c.products.slice(0, 10).map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: absoluteUrl(localizePath(`${path}/urun/${p.slug}`, locale)),
              name: p.name,
            })),
          },
        }
      : {}),
    mainEntityOfPage: { "@id": url },
  });

  const pageNode = compact({
    "@type": "ProfilePage",
    "@id": url,
    url,
    name: title,
    description,
    inLanguage: companyContentLang(c, locale) ?? LANG_TAG[locale],
    isPartOf: { "@id": SITE_ID() },
    mainEntity: { "@id": companyId },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    ...(c.updatedAt ? { dateModified: c.updatedAt } : {}),
  });

  /* ORTALAMA PUAN YAZILMAZ: şema `aggregateRating` için oy SAYISI ister
     (`ratingCount`/`reviewCount`) ve herkese açık profil yalnız ortalamayı
     döndürüyor (değerlendirme sayısı üyeye kapalı — CLAUDE.md § görünürlük).
     Sayıyı uydurmak ya da 1 yazmak zengin sonucu geçersiz kılar; alan hiç
     yazılmaz. Sayı herkese açılırsa buraya eklenmeli. */

  return {
    metadata: buildMetadata({
      title,
      description,
      path,
      // Kapak yoksa firmanın KENDİ OG kartı (ad + sektör + şehir); logo kare
      // ve küçük — paylaşım kartında bozuk görünür (2026-09-27: kapaksız
      // firmaların hepsi marka kartına düşüyordu, segment kartı kullanılmıyordu).
      images: [c.coverImageUrl ?? ogCardPath(path, locale)],
      type: "profile",
      noindex: c.indexable === false,
      locale: opts.locale,
      locales: readyLocalesOf(c.readyLocales),
    }),
    jsonLd: graph([
      orgNode,
      pageNode,
      {
        "@id": `${url}#breadcrumb`,
        ...breadcrumbNode([
          { name: ts("web.marketing.breadcrumbHome"), path: "/" },
          { name: ts("web.marketplace.labels.companies"), path: MARKETPLACE_ROUTES.companies },
          { name: c.name, path },
        ], locale),
      },
    ]),
    summary,
  };
}

/* ------------------------------------------------------------------ */
/* Alım talebi                                                         */
/* ------------------------------------------------------------------ */

export interface ListingSeoInput {
  number: string;
  /** Dilden bağımsız slug (API) — yoksa başlıktan üretilir. */
  slug?: string | null;
  title: string;
  description: string | null;
  closesAt: string | null;
  open: boolean;
  indexable: boolean;
  itemSummary: { count: number; totalQuantity: string | null; unit: string | null };
  categories: { id: string; name: string }[];
  /** SAHİBİN ADI ALINMAZ — bilerek: tip düzeyinde de sızdırılamasın. */
  /** Alıcının konumu yalnız ÜLKE (2026-10-04: talepte şehir yok). */
  buyer: { country: string | null; isInternational: boolean };
  coverImageUrl: string | null;
  updatedAt?: string | null;
  /** Dil durumu (API): hreflang yalnız hazır diller. */
  readyLocales?: string[];
  sourceLocale?: string;
}

/**
 * Herkese açık ilan yükünden SEO girdisi. Sayfa ve bileşen AYNI dönüşümü
 * kullanır; ayrı yazılsalardı biri sahibin adını taşıyabilirdi (tip düzeyinde
 * de engelli: `ListingSeoInput.buyer` yalnız konum alanları taşır).
 */
export function listingSeoInput(l: {
  number: string;
  /** Dilden bağımsız slug (API) — yoksa başlıktan üretilir. */
  slug?: string | null;
  title: string;
  description: string | null;
  closesAt: string | null;
  status: string;
  indexable: boolean;
  itemSummary: { count: number; totalQuantity: string | null; unit: string | null };
  categories: { id: string; name: string }[];
  isInternational: boolean;
  coverImageUrl: string | null;
  company: { country: string | null };
  updatedAt?: string | null;
  readyLocales?: string[];
  sourceLocale?: string;
}): ListingSeoInput {
  return {
    number: l.number,
    slug: l.slug ?? null,
    title: l.title,
    description: l.description,
    closesAt: l.closesAt,
    open: l.status === "OPEN",
    indexable: l.indexable,
    itemSummary: l.itemSummary,
    categories: l.categories,
    buyer: {
      country: l.company.country,
      isInternational: l.isInternational,
    },
    coverImageUrl: l.coverImageUrl,
    updatedAt: l.updatedAt ?? null,
    readyLocales: l.readyLocales,
    sourceLocale: l.sourceLocale,
  };
}

export function listingSeo(l: ListingSeoInput, opts: SeoOptions): {
  metadata: Metadata;
  jsonLd: JsonLdNode;
  summary: string;
} {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  const ts = opts.t;
  const path = listingHref(l);
  const url = absoluteUrl(localizePath(path, locale));
  const cat = l.categories[0]?.name ?? null;
  const unit = l.itemSummary.unit ? unitLabelWith(ts, l.itemSummary.unit) : null;
  // Çoğul kuralı + sayı biçimi (derin denetim S094): tekil etiketi yapıştırmak
  // EN/RU'da "1500 piece" basıyordu. JSON-LD `unitText` tekil etiket kalır.
  const qty =
    l.itemSummary.totalQuantity && unit ? quantityWith(ts, l.itemSummary.totalQuantity, l.itemSummary.unit) : null;

  const summary = joinParts(
    [
      joinParts([l.title, cat], " — "),
      qty,
      l.itemSummary.count > 1 ? ts("web.seo.items", { n: l.itemSummary.count }) : null,
      // Talebin açıldığı ÜLKE (2026-10-04): sayfa da şehir yerine ülkeyi gösterir.
      l.buyer.country ? ts("web.seo.buyerCountry", { country: countryDisplayName(l.buyer.country, locale) }) : null,
      l.open ? ts("web.seo.openForQuotes") : ts("web.seo.closed"),
    ],
    " · ",
  );

  const description = clampDescription(
    joinParts(
      [
        l.description ? clampDescription(l.description, 90) : null,
        qty ? ts("web.seo.qty", { qty }) : null,
        cat,
        l.buyer.country ? countryDisplayName(l.buyer.country, locale) : null,
        ts("web.seo.sealedTail"),
      ],
      " · ",
    ),
  );

  const demandId = entityId.demand(path);
  // Numara korunur, talep başlığı 75 tavanına (` · Rothern` soneki + ` — <no>`
  // düşülerek) kırpılır; DTO başlığa 200 karaktere kadar izin veriyor
  // (derin denetim LU-24).
  const titleMax = 75 - TITLE_SUFFIX.length - (l.number ? l.number.length + 3 : 0);
  const title = joinParts([clampTitle(l.title, null, titleMax), l.number], " — ");
  const demandNode = compact({
    "@type": "Demand",
    "@id": demandId,
    name: l.title,
    url,
    identifier: l.number,
    description: l.description ?? summary,
    ...(l.closesAt ? { validThrough: l.closesAt } : {}),
    availability: l.open ? "https://schema.org/InStock" : "https://schema.org/Discontinued",
    /* SAHİP ANONİM: `seller`/`offeredBy` düğümü YAZILMAZ. Sayfada gizlediğimiz
       kimliği yapılandırılmış veride vermek, onu makine-okunur biçimde geri
       vermek olurdu (CLAUDE.md § İLAN SAHİBİ ANONİM). Konum kalır — sayfada
       da görünüyor ve lojistik için anlamlı. */
    seeks: compact({
      "@type": "Product",
      name: l.title,
      ...(cat ? { category: cat } : {}),
    }),
    ...(qty
      ? {
          eligibleQuantity: {
            "@type": "QuantitativeValue",
            value: l.itemSummary.totalQuantity,
            unitText: unit,
          },
        }
      : {}),
    // Yapılandırılmış veri sayfada görüneni yansıtır: talep konumu ülke
    // (2026-10-04), alıcının şehri sayfada artık basılmıyor → şemaya da yazılmaz.
    ...(isoCountry(l.buyer.country)
      ? {
          areaServed: {
            "@type": "Place",
            address: compact({
              "@type": "PostalAddress",
              addressCountry: isoCountry(l.buyer.country),
            }),
          },
        }
      : {}),
    mainEntityOfPage: { "@id": url },
  });

  const pageNode = compact({
    "@type": "ItemPage",
    "@id": url,
    url,
    name: title,
    description,
    inLanguage: contentLangOf(l, locale) ?? LANG_TAG[locale],
    isPartOf: { "@id": SITE_ID() },
    mainEntity: { "@id": demandId },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    ...(l.updatedAt ? { dateModified: l.updatedAt } : {}),
  });

  return {
    metadata: buildMetadata({
      title,
      description,
      path,
      // Görsel yoksa talebin KENDİ OG kartı (numara + başlık + konum; sahip adı
      // YOK) — eskiden marka kartına düşüyordu, segment kartı kullanılmıyordu.
      images: [l.coverImageUrl ?? ogCardPath(path, locale)],
      noindex: !l.indexable,
      locale: opts.locale,
      locales: readyLocalesOf(l.readyLocales),
    }),
    jsonLd: graph([
      demandNode,
      pageNode,
      {
        "@id": `${url}#breadcrumb`,
        ...breadcrumbNode([
          { name: ts("web.marketing.breadcrumbHome"), path: "/" },
          { name: ts("web.marketplace.labels.demands"), path: MARKETPLACE_ROUTES.demands },
          { name: l.title, path },
        ], locale),
      },
    ]),
    summary,
  };
}


/**
 * Firma başlığı "ad — sektör, şehir"; 75 karakter tavanına sığmazsa önce şehir,
 * sonra sektör düşer, en son ad kısalır. Çevrilmiş sektör adları (EN/RU) uzun
 * olabildiği için tavan aşılıyordu (yerel SEO denetimi 2026-09-26: 80-84).
 */
export function companyTitle(name: string, industry?: string | null, city?: string | null): string {
  const max = 75 - TITLE_SUFFIX.length;
  for (const tail of [joinParts([industry, city], ", "), industry ?? "", city ?? ""]) {
    const full = joinParts([name, tail], " — ");
    if (tail && full.length <= max) return full;
  }
  return clampTitle(name);
}

/**
 * "<ürün> — <firma>" en çok 75 karakter (kök düzenin `· Rothern` soneki
 * `TITLE_SUFFIX` ile düşülür); sığmazsa firma düşer, sonra ürün adı kısalır.
 */
export function clampTitle(
  name: string,
  brand?: string | null,
  max = 75 - TITLE_SUFFIX.length,
): string {
  const full = joinParts([name, brand], " — ");
  if (full.length <= max) return full;
  return fitTitle(name, max);
}
