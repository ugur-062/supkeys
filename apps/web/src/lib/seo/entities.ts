import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES, categoryPath, listingPath } from "@/lib/public/marketplace";
import { productPrice } from "@/lib/public/product-price";
import { breadcrumbNode, compact, graph, type JsonLdNode } from "@/lib/seo/jsonld";
import { absoluteUrl, buildMetadata, clampDescription, joinParts } from "@/lib/seo/meta";
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
 */

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
    moq: string | null;
    priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
    priceAmount: string | null;
    priceTiers: { minQty: number; unitPrice: number }[] | null;
    priceCurrency: string;
    category?: { id: string; name: string } | null;
    attributeList?: { label: string; value: string; unit: string | null }[];
    keywords?: string[];
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

function priceSentence(p: ProductSeoInput["product"]): string {
  const price = productPrice(p);
  if (price.hasPrice) return price.headline;
  return "Fiyat için teklif isteyin";
}

export function productSeo(input: ProductSeoInput): {
  metadata: Metadata;
  jsonLd: JsonLdNode;
  summary: string;
} {
  const { product: pr, company: co, companySlug } = input;
  const path = `/firma/${companySlug}/urun/${pr.slug}`;
  const url = absoluteUrl(path);
  const images = pr.images.map((i) => (i.startsWith("http") ? i : absoluteUrl(i)));
  const where = joinParts([co.name, co.city], ", ");

  /* Tanım cümlesi: NE + KİM + NEREDE + FİYAT + MOQ. Arama sonucunda ve AI
     cevabında tek başına anlamlı olmalı — "ürün sayfası" demek yetmez. */
  const summary = joinParts(
    [
      joinParts([pr.name, pr.category?.name], " — "),
      where ? `${where} vitrininde` : null,
      priceSentence(pr),
      pr.moq ? `min. ${pr.moq} ${pr.unit}` : null,
    ],
    " · ",
  );

  /* Satıcının KENDİ metni varsa açıklamanın başında durur: özgün içerik hem
     sıralamada hem alıntıda şablon cümleden değerlidir. Olgular arkaya
     eklenir; 160'ta kelime sınırında kesilir. */
  const lead = pr.description ? clampDescription(pr.description, 96) : null;
  const description = clampDescription(
    joinParts([lead, priceSentence(pr), pr.moq ? `min. ${pr.moq} ${pr.unit}` : null, where], " · "),
  );

  const title = joinParts([pr.name, co.name], " — ");

  const offer = compact({
    "@type": "Offer",
    url,
    availability: "https://schema.org/InStock",
    priceCurrency: pr.priceCurrency,
    ...(pr.priceMode === "FIXED" && pr.priceAmount ? { price: pr.priceAmount } : {}),
    ...(pr.priceMode === "TIERED" && pr.priceTiers?.length
      ? {
          priceSpecification: pr.priceTiers.map((t) => ({
            "@type": "UnitPriceSpecification",
            price: t.unitPrice,
            priceCurrency: pr.priceCurrency,
            eligibleQuantity: {
              "@type": "QuantitativeValue",
              minValue: t.minQty,
              unitText: pr.unit,
            },
          })),
        }
      : {}),
    ...(pr.moq
      ? {
          eligibleQuantity: {
            "@type": "QuantitativeValue",
            minValue: Number(pr.moq) || undefined,
            unitText: pr.unit,
          },
        }
      : {}),
    /* Satıcı kimliği ÜRÜNDE açıktır (ilan sahibinin tersine): ürün sayfası
       firmanın opt-in vitrinidir ve adı sayfada zaten yazılı. */
    seller: compact({
      "@type": "Organization",
      name: co.name,
      ...(co.slug ? { url: absoluteUrl(`/firma/${co.slug}`) } : {}),
      ...(co.city
        ? {
            address: {
              "@type": "PostalAddress",
              addressLocality: co.city,
              addressCountry: co.country ?? "TR",
            },
          }
        : {}),
    }),
  });

  const productNode = compact({
    "@type": "Product",
    name: pr.name,
    url,
    description: pr.description ?? summary,
    inLanguage: "tr-TR",
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
    offers: offer,
  });

  return {
    metadata: buildMetadata({
      title,
      description,
      path,
      images: images.slice(0, 1),
      noindex: !input.indexable,
    }),
    jsonLd: graph([
      productNode,
      breadcrumbNode([
        { name: "Anasayfa", path: "/" },
        { name: MARKETPLACE_LABELS.products, path: MARKETPLACE_ROUTES.products },
        ...(pr.category ? [{ name: pr.category.name, path: categoryPath(pr.category.id, pr.category.name) }] : []),
        { name: co.name, path: `/firma/${companySlug}` },
        { name: pr.name, path },
      ]),
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
}

export function companySeo(c: CompanySeoInput): {
  metadata: Metadata;
  jsonLd: JsonLdNode;
  summary: string;
} {
  const path = `/firma/${c.slug}`;
  const url = absoluteUrl(path);

  const summary = joinParts(
    [
      joinParts([c.name, c.industry], " — "),
      c.city ? `${c.city} merkezli` : null,
      c.productCount > 0 ? `${c.productCount} ürün vitrinde` : null,
      c.verified ? "Rothern'de doğrulanmış firma" : null,
    ],
    " · ",
  );

  const lead = c.aboutText ? clampDescription(c.aboutText, 100) : null;
  const description = clampDescription(
    joinParts(
      [
        lead,
        joinParts([c.industry, c.city], ", "),
        c.productCount > 0 ? `${c.productCount} ürün` : null,
        "Rothern firma profili",
      ],
      " · ",
    ),
  );

  const image = c.coverImageUrl ?? c.logoUrl;

  const orgNode = compact({
    "@type": "Organization",
    "@id": `${url}#company`,
    name: c.name,
    url,
    description: c.aboutText ?? summary,
    inLanguage: "tr-TR",
    ...(c.logoUrl ? { logo: c.logoUrl } : {}),
    ...(image ? { image } : {}),
    ...(c.foundedYear ? { foundingDate: String(c.foundedYear) } : {}),
    /* `employeeCount` bir ARALIK ("11-50") — sayı değil. Şemaya sayı gibi
       yazmak yanlış veri olurdu; `QuantitativeValue.name` metni taşır. */
    ...(c.employeeCount ? { numberOfEmployees: { "@type": "QuantitativeValue", name: c.employeeCount } } : {}),
    ...(c.categories.length ? { knowsAbout: c.categories.map((k) => k.name) } : {}),
    ...(c.certifications?.length ? { hasCredential: c.certifications } : {}),
    ...(c.city
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: c.city,
            addressCountry: c.country ?? "TR",
          },
        }
      : {}),
    areaServed: { "@type": "Country", name: c.country === "TR" || !c.country ? "Türkiye" : c.country },
    ...(c.products?.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: `${c.name} ürünleri`,
            itemListElement: c.products.slice(0, 10).map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: absoluteUrl(`${path}/urun/${p.slug}`),
              name: p.name,
            })),
          },
        }
      : {}),
  });

  /* ORTALAMA PUAN YAZILMAZ: şema `aggregateRating` için oy SAYISI ister
     (`ratingCount`/`reviewCount`) ve herkese açık profil yalnız ortalamayı
     döndürüyor (değerlendirme sayısı üyeye kapalı — CLAUDE.md § görünürlük).
     Sayıyı uydurmak ya da 1 yazmak zengin sonucu geçersiz kılar; alan hiç
     yazılmaz. Sayı herkese açılırsa buraya eklenmeli. */

  return {
    metadata: buildMetadata({
      title: joinParts([c.name, joinParts([c.industry, c.city], ", ")], " — "),
      description,
      path,
      images: image ? [image] : undefined,
      type: "profile",
    }),
    jsonLd: graph([
      orgNode,
      breadcrumbNode([
        { name: "Anasayfa", path: "/" },
        { name: MARKETPLACE_LABELS.companies, path: MARKETPLACE_ROUTES.companies },
        { name: c.name, path },
      ]),
    ]),
    summary,
  };
}

/* ------------------------------------------------------------------ */
/* Alım talebi                                                         */
/* ------------------------------------------------------------------ */

export interface ListingSeoInput {
  number: string;
  title: string;
  description: string | null;
  closesAt: string | null;
  open: boolean;
  indexable: boolean;
  itemSummary: { count: number; totalQuantity: string | null; unit: string | null };
  categories: { id: string; name: string }[];
  /** SAHİBİN ADI ALINMAZ — bilerek: tip düzeyinde de sızdırılamasın. */
  buyer: { city: string | null; country: string | null; isInternational: boolean };
  coverImageUrl: string | null;
}

/**
 * Herkese açık ilan yükünden SEO girdisi. Sayfa ve bileşen AYNI dönüşümü
 * kullanır; ayrı yazılsalardı biri sahibin adını taşıyabilirdi (tip düzeyinde
 * de engelli: `ListingSeoInput.buyer` yalnız konum alanları taşır).
 */
export function listingSeoInput(l: {
  number: string;
  title: string;
  description: string | null;
  closesAt: string | null;
  status: string;
  indexable: boolean;
  itemSummary: { count: number; totalQuantity: string | null; unit: string | null };
  categories: { id: string; name: string }[];
  isInternational: boolean;
  coverImageUrl: string | null;
  company: { city: string | null; country: string | null };
}): ListingSeoInput {
  return {
    number: l.number,
    title: l.title,
    description: l.description,
    closesAt: l.closesAt,
    open: l.status === "OPEN",
    indexable: l.indexable,
    itemSummary: l.itemSummary,
    categories: l.categories,
    buyer: {
      city: l.company.city,
      country: l.company.country,
      isInternational: l.isInternational,
    },
    coverImageUrl: l.coverImageUrl,
  };
}

export function listingSeo(l: ListingSeoInput): {
  metadata: Metadata;
  jsonLd: JsonLdNode;
  summary: string;
} {
  const path = listingPath(l.number, l.title);
  const url = absoluteUrl(path);
  const cat = l.categories[0]?.name ?? null;
  const qty =
    l.itemSummary.totalQuantity && l.itemSummary.unit
      ? `${l.itemSummary.totalQuantity} ${l.itemSummary.unit}`
      : null;

  const summary = joinParts(
    [
      joinParts([l.title, cat], " — "),
      qty,
      l.itemSummary.count > 1 ? `${l.itemSummary.count} kalem` : null,
      l.buyer.city ? `alıcı: ${l.buyer.city}` : null,
      l.open ? "teklife açık" : "kapandı",
    ],
    " · ",
  );

  const description = clampDescription(
    joinParts(
      [
        l.description ? clampDescription(l.description, 90) : null,
        qty ? `Miktar: ${qty}` : null,
        cat,
        l.buyer.city ?? null,
        "Kapalı zarf teklif — Rothern",
      ],
      " · ",
    ),
  );

  const demandNode = compact({
    "@type": "Demand",
    name: l.title,
    url,
    identifier: l.number,
    inLanguage: "tr-TR",
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
            unitText: l.itemSummary.unit,
          },
        }
      : {}),
    ...(l.buyer.city
      ? {
          areaServed: {
            "@type": "Place",
            address: {
              "@type": "PostalAddress",
              addressLocality: l.buyer.city,
              addressCountry: l.buyer.country ?? "TR",
            },
          },
        }
      : {}),
  });

  return {
    metadata: buildMetadata({
      title: joinParts([l.title, l.number], " — "),
      description,
      path,
      images: l.coverImageUrl ? [l.coverImageUrl] : undefined,
      noindex: !l.indexable,
    }),
    jsonLd: graph([
      demandNode,
      breadcrumbNode([
        { name: "Anasayfa", path: "/" },
        { name: MARKETPLACE_LABELS.demands, path: MARKETPLACE_ROUTES.demands },
        { name: l.title, path },
      ]),
    ]),
    summary,
  };
}
