import { OPERATOR } from "@/lib/company-info";
import { absoluteUrl, SITE_NAME } from "@/lib/seo/meta";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { localizePath } from "@/i18n/href";
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";

/**
 * YAPILANDIRILMIŞ VERİ TEK KAYNAĞI (2026-09-09).
 *
 * Neden tek kaynak: JSON-LD sayfada GÖRÜNMEYEN bir katman. Ayrı ayrı elle
 * yazıldığında (a) bir sayfa `Organization`ı eksik alanla basar, (b) daha
 * kötüsü, sayfada GİZLİ olan bir alan yapılandırılmış veriye sızar. İkincisi
 * gerçek bir gizlilik kaçağıdır: `/talep/...` sayfasında ilan sahibinin adını
 * gizliyoruz ama JSON-LD'ye `Organization` düğümü koysaydık aynı kimliği
 * MAKİNE OKUNUR biçimde geri vermiş olurduk (CLAUDE.md § İLAN SAHİBİ ANONİM).
 *
 * KURAL: bu dosyadaki üreticiler yalnız ÇAĞIRANIN VERDİĞİ alanları yazar ve
 * hiçbiri veri uydurmaz — boş alan düğüme hiç girmez (`undefined` atılır).
 * Kapılı alanın buraya gelmemesi çağıranın sorumluluğudur; sözleşme testi
 * (`json-ld-leak.test`) anonim sayfaların çıktısını tarar.
 */

export type JsonLdNode = Record<string, unknown>;

/** `undefined`/boş dizi alanları düşürür — şemada boş alan gürültüdür. */
export function compact<T extends JsonLdNode>(node: T): T {
  const out: JsonLdNode = {};
  for (const [k, v] of Object.entries(node)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

/** Birden çok düğümü TEK script'te yayınlar — tarayıcılar `@graph`i tercih eder. */
export function graph(nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) };
}

/* ------------------------------------------------------------------ */
/* Site geneli kimlik                                                  */
/* ------------------------------------------------------------------ */

export const ORG_ID = () => `${absoluteUrl("/")}#organization`;
export const SITE_ID = () => `${absoluteUrl("/")}#website`;

/**
 * Platformun kendi kimliği. GEO için kritik: üretken motorlar bir cevabı
 * kaynağa bağlarken yayıncıyı arar; künye sayfasındaki bilgilerle BİREBİR
 * aynı olmalı (`lib/company-info.ts` tek kaynak).
 */
export function organizationNode(): JsonLdNode {
  return compact({
    "@type": "Organization",
    "@id": ORG_ID(),
    name: SITE_NAME,
    legalName: OPERATOR.legalName,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/rothern-logo-on-light.png"),
    email: OPERATOR.supportEmail,
    vatID: OPERATOR.taxNo.replace(/\s/g, ""),
    /* MERSİS = Türkiye'nin resmî ticaret sicili kimliği. Üretken motorlar
       yayıncıyı gerçek bir tüzel kişiye bağlarken bunu arar. */
    identifier: {
      "@type": "PropertyValue",
      name: "MERSİS",
      value: OPERATOR.mersisNo,
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: OPERATOR.addressParts.street,
      addressLocality: OPERATOR.addressParts.district,
      addressRegion: OPERATOR.addressParts.city,
      addressCountry: OPERATOR.addressParts.country,
    },
    areaServed: { "@type": "Country", name: "Türkiye" },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: OPERATOR.supportEmail,
        availableLanguage: ["tr"],
      },
    ],
  });
}

/** Site düğümü + arama eylemi (Google "sitelinks search box" ve AI keşfi). */
export function webSiteNode(): JsonLdNode {
  return compact({
    "@type": "WebSite",
    "@id": SITE_ID(),
    name: SITE_NAME,
    url: absoluteUrl("/"),
    inLanguage: "tr-TR",
    publisher: { "@id": ORG_ID() },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl(MARKETPLACE_ROUTES.products)}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  });
}

/** Her public sayfanın taşıdığı kimlik grafiği. */
export function siteGraph(): JsonLdNode {
  return graph([organizationNode(), webSiteNode()]);
}

/* ------------------------------------------------------------------ */
/* Gezinme                                                             */
/* ------------------------------------------------------------------ */

export interface Crumb {
  name: string;
  /** Site köküne göre yol; son kırıntıda da verilir (kanonik ile aynı). */
  path: string;
}

/** `locale` verilirse kırıntı adresleri o dilin ön ekini alır (`/en/urunler`); adlar çağırandan çevrili gelir. */
export function breadcrumbNode(items: Crumb[], locale: Locale = DEFAULT_LOCALE): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(localizePath(c.path, locale)),
    })),
  };
}

/**
 * Liste sayfaları (ürün dizini, firma dizini, talep listesi, kategori, şehir).
 * `ItemList` bir liste sayfasının NE listelediğini söyler; onsuz sayfa
 * motorlar için "bir sürü bağlantı"dır. Sıra numarası 1'den başlar ve
 * SAYFALAMAYI yansıtır (2. sayfada 13. sıradan devam eder).
 */
export function itemListNode(input: {
  name: string;
  path: string;
  items: Array<{ name: string; path: string }>;
  startPosition?: number;
  totalItems?: number;
}): JsonLdNode {
  const start = input.startPosition ?? 1;
  return compact({
    "@type": "ItemList",
    name: input.name,
    url: absoluteUrl(input.path),
    numberOfItems: input.totalItems ?? input.items.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: input.items.map((it, i) => ({
      "@type": "ListItem",
      position: start + i,
      name: it.name,
      url: absoluteUrl(it.path),
    })),
  });
}

/**
 * Soru-cevap. GEO'nun en doğrudan aracı: üretken motorlar cevabı hazır
 * biçimde bulduğunda sayfayı kaynak gösterir. Cevaplar SİTEDE DE görünmeli —
 * yalnız yapılandırılmış veride duran cevap hem yönergelere aykırı hem
 * kullanıcıya faydasız.
 */
export function faqNode(qa: Array<{ q: string; a: string }>): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
