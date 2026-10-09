import {
  companySeo as companySeo0,
  listingSeo as listingSeo0,
  listingSeoInput,
  productSeo as productSeo0,
  type CompanySeoInput,
  type ListingSeoInput,
  type ProductSeoInput,
} from "@/lib/seo/entities";
import { listingOgContent, productOgContent } from "@/lib/seo/og/content";
import { buildLlmsFullTxt } from "@/lib/seo/llms";
import type { PublicListingDetail } from "@/lib/public/marketplace-api";
import { seoT } from "@/i18n/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site-url", () => ({ resolveSiteUrl: () => "https://www.rothern.com" }));

/**
 * GİZLİ SEGMENT SEO/GEO KATMANINDA DA GÖRÜNMEZ (2026-10-09, sahip kararı:
 * "anasayfada olmayan kategori talepte, üründe ya da başka yerde de
 * gösterilmesin"; arayüz denetimi W-03, W-04).
 *
 * Meta açıklaması, özet cümlesi, JSON-LD ve OG kartı sayfada GÖRÜNMEYEN
 * katmanlardır: gözle fark edilmez ama tarayıcı ve yapay zekâ modeli okur.
 * Sayfada çizmediğimiz gizli kategori adını oraya yazmak onu makine-okunur
 * biçimde geri vermek olurdu. Eski kayıt (46 = kolluk/emniyet, 10 = canlı
 * bitki segmentinde saklanmış ürün, talep, firma beyanı) YAYINDA KALIR ve
 * kategorisiz DÜZGÜN bir açıklama/graf/kart üretir.
 */
const T = { t: seoT("tr") };
const productSeo = (i: ProductSeoInput) => productSeo0(i, T);
const companySeo = (i: CompanySeoInput) => companySeo0(i, T);
const listingSeo = (i: ListingSeoInput) => listingSeo0(i, T);
const graphOf = (jsonLd: unknown) => (jsonLd as { "@graph": Record<string, unknown>[] })["@graph"];

const HIDDEN_NAMES = /Koruyucu giysi|Kolluk|Canlı Bitki|Çevre Hizmetleri/;

const product = {
  name: "Kesilmeye dayanıklı iş eldiveni",
  slug: "is-eldiveni",
  description: "EN 388 seviye 5 kesilmeye dayanıklı iş eldiveni, nitril kaplı avuç içi.",
  images: [],
  brand: null,
  mpn: null,
  unit: "çift",
  moq: "100",
  priceMode: "FIXED" as const,
  priceAmount: "85",
  priceTiers: null,
  priceCurrency: "TRY",
  category: { id: "46181500", name: "Koruyucu giysi" },
  // Eski API bu ikisini de dolu gönderebilir — web ikinci kattır.
  segment: { id: "46000000", name: "Kolluk ve Emniyet Ekipmanları", slug: "kolluk-ve-emniyet-ekipmanlari" },
};
const company = { name: "Acme İş Güvenliği A.Ş.", slug: "acme-is-guvenligi", city: "İzmir", country: "TR", industry: "İş güvenliği" };

describe("productSeo — gizli segmentteki eski ürün", () => {
  const seo = productSeo({ companySlug: "acme-is-guvenligi", product, company, indexable: true });
  const graph = graphOf(seo.jsonLd);
  const raw = JSON.stringify(seo.jsonLd);

  it("özet, açıklama ve JSON-LD gizli kategori adını TAŞIMAZ; Product.category yazılmaz", () => {
    expect(seo.summary).not.toMatch(HIDDEN_NAMES);
    expect(String(seo.metadata.description)).not.toMatch(HIDDEN_NAMES);
    expect(raw).not.toMatch(HIDDEN_NAMES);
    expect(graph[0]).not.toHaveProperty("category");
  });

  it("kırıntı gizli segmentin (404 veren) sayfasına bağlanmaz: Anasayfa › Ürünler › Firma › Ürün", () => {
    expect(raw).not.toContain("/urunler/kategori/46000000");
    const crumbs = (graph.find((n) => String(n["@id"]).endsWith("#breadcrumb"))!.itemListElement as { name: string }[]).map((c) => c.name);
    expect(crumbs).toEqual(["Anasayfa", "Ürünler", company.name, product.name]);
  });

  it("kategorisiz özet düzgün kurulur: sahipsiz ayraç yok, olgular yerinde", () => {
    expect(seo.summary.startsWith(`${product.name} · `)).toBe(true);
    expect(seo.summary).not.toMatch(/—\s*·|·\s*·|—\s*$/);
    expect(seo.summary).toContain("İzmir");
    expect(seo.metadata.title).toContain(product.name);
  });

  it("görünür kategoride davranış değişmez (ad özet ve grafta)", () => {
    const visible = productSeo({
      companySlug: "acme-is-guvenligi",
      product: {
        ...product,
        category: { id: "40101700", name: "Isı eşanjörleri" },
        segment: { id: "40000000", name: "Dağıtım Sistemleri", slug: "dagitim-sistemleri" },
      },
      company,
      indexable: true,
    });
    expect(visible.summary).toContain("Isı eşanjörleri");
    expect(graphOf(visible.jsonLd)[0]).toMatchObject({ category: "Isı eşanjörleri" });
    expect(JSON.stringify(visible.jsonLd)).toContain("/urunler/kategori/40000000-dagitim-sistemleri");
  });
});

describe("companySeo — gizli segmentte eski beyanı olan firma", () => {
  const base: CompanySeoInput = {
    slug: "acme-is-guvenligi",
    name: company.name,
    industry: "İş güvenliği",
    city: "İzmir",
    country: "TR",
    aboutText: "1998'den beri iş güvenliği ekipmanları üretiyoruz.",
    logoUrl: null,
    coverImageUrl: null,
    foundedYear: 1998,
    employeeCount: "11-50",
    categories: [
      { id: "46000000", name: "Kolluk ve Emniyet Ekipmanları" },
      { id: "31000000", name: "Üretim Bileşenleri" },
      { id: "77000000", name: "Çevre Hizmetleri" },
    ],
    productCount: 3,
  };

  it("knowsAbout yalnız GÖRÜNÜR segmentleri sayar", () => {
    const org = graphOf(companySeo(base).jsonLd)[0]!;
    expect(org.knowsAbout).toEqual(["Üretim Bileşenleri"]);
    expect(JSON.stringify(companySeo(base).jsonLd)).not.toMatch(HIDDEN_NAMES);
  });

  it("görünür segmenti kalmayan firmada knowsAbout HİÇ yazılmaz (boş dizi de değil)", () => {
    const org = graphOf(companySeo({ ...base, categories: [{ id: "46000000", name: "Kolluk ve Emniyet Ekipmanları" }] }).jsonLd)[0]!;
    expect(org).not.toHaveProperty("knowsAbout");
    expect(org.name).toBe(company.name);
  });
});

describe("listingSeo — gizli segmentteki eski talep", () => {
  const listing = {
    number: "ROT-000460",
    title: "İş güvenliği eldiveni alımı",
    description: "Üretim hattı için yıllık eldiven ihtiyacı.",
    closesAt: "2026-11-20T00:00:00.000Z",
    status: "OPEN",
    indexable: true,
    itemSummary: { count: 1, totalQuantity: "5000", unit: "adet" },
    categories: [{ id: "46181500", name: "Koruyucu giysi" }],
    isInternational: false,
    coverImageUrl: null,
    company: { city: null, country: "TR" },
  };

  it("açıklama, özet ve Demand.seeks gizli kategoriyi taşımaz; talep sayfası yine tam", () => {
    const seo = listingSeo(listingSeoInput(listing));
    const demand = graphOf(seo.jsonLd)[0]!;
    expect(seo.summary).not.toMatch(HIDDEN_NAMES);
    expect(String(seo.metadata.description)).not.toMatch(HIDDEN_NAMES);
    expect(JSON.stringify(seo.jsonLd)).not.toMatch(HIDDEN_NAMES);
    expect(demand.seeks).toEqual({ "@type": "Product", name: listing.title });
    // Kategorisiz açıklama düzgün: sahipsiz ayraç yok, miktar ve ülke yerinde.
    const description = String(seo.metadata.description);
    expect(description).not.toMatch(/·\s*·|^\s*·|·\s*$/);
    expect(description).toContain("Miktar: 5.000 adet");
    expect(description).toContain("Türkiye");
    expect(seo.summary.startsWith(`${listing.title} · `)).toBe(true);
  });

  it("gizli + görünür kategoride ilk GÖRÜNÜR ad kullanılır", () => {
    const seo = listingSeo(
      listingSeoInput({
        ...listing,
        categories: [
          { id: "46181500", name: "Koruyucu giysi" },
          { id: "24100000", name: "Ambalaj malzemeleri" },
        ],
      }),
    );
    expect(graphOf(seo.jsonLd)[0]!.seeks).toMatchObject({ category: "Ambalaj malzemeleri" });
    expect(seo.summary).toContain("Ambalaj malzemeleri");
    expect(JSON.stringify(seo.jsonLd)).not.toMatch(HIDDEN_NAMES);
  });
});

describe("OG kartı — gizli segment (W-04)", () => {
  const ogProduct = {
    name: "Kesilmeye dayanıklı iş eldiveni",
    images: [],
    priceMode: "ON_REQUEST",
    priceAmount: null,
    priceTiers: null,
    priceCurrency: "TRY",
    unit: "adet",
    moq: null,
    brand: null,
  };

  it("ürün kartı: gizli kategori üst etikete basılmaz, kategorisiz 'ÜRÜN' etiketi kalır", () => {
    const hidden = productOgContent({ ...ogProduct, category: { id: "46181500", name: "Koruyucu giysi" } } as never, { name: "Acme", city: null } as never);
    const none = productOgContent({ ...ogProduct, category: null } as never, { name: "Acme", city: null } as never);
    expect(JSON.stringify(hidden)).not.toMatch(/koruyucu giysi/i);
    expect(hidden.eyebrow).toBe(none.eyebrow);
    const visible = productOgContent({ ...ogProduct, category: { id: "40000000", name: "Boru ve Bağlantı" } } as never, { name: "Acme", city: null } as never);
    expect(visible.eyebrow).toContain("BORU VE BAĞLANTI");
  });

  it("talep kartı: alt satır gizli kategoriyle başlamaz; yalnız ülke kalır (sahipsiz ' · ' yok)", () => {
    const l = {
      number: "ROT-000460",
      type: "ALIM",
      title: "İş güvenliği eldiveni alımı",
      status: "OPEN",
      coverImageUrl: null,
      closesAt: "2026-11-20T00:00:00.000Z",
      publishedAt: null,
      primaryCurrency: "TRY",
      isInternational: false,
      itemCount: 1,
      itemSummary: { count: 1, totalQuantity: null, unit: null },
      company: { city: null, country: "TR", industry: null, activities: [], verified: false },
      categories: [{ id: "46181500", name: "Koruyucu giysi", level: 3 }],
    } as unknown as PublicListingDetail;
    expect(listingOgContent(l).subtitle).toBe("Türkiye");
    expect(JSON.stringify(listingOgContent(l))).not.toMatch(HIDDEN_NAMES);
    // Ülke de yoksa alt satır hiç yok.
    expect(listingOgContent({ ...l, company: { ...l.company, country: null } } as PublicListingDetail).subtitle).toBeNull();
    // Gizliden sonra gelen görünür kategori kullanılır.
    const mixed = { ...l, categories: [...l.categories, { id: "30000000", name: "Yapı Malzemeleri", level: 1 }] } as PublicListingDetail;
    expect(listingOgContent(mixed).subtitle).toBe("Yapı Malzemeleri · Türkiye");
  });
});

describe("llms-full.txt — kategori listesi", () => {
  it("gizli segment (API facet'inde gelse bile) listeye ve bağlantıya girmez", () => {
    const txt = buildLlmsFullTxt("tr", seoT("tr"), {
      stats: { products: 12, openDemands: 3, categories: 2 },
      facets: {
        categories: [
          { id: "40000000", name: "Dağıtım ve Şartlandırma Sistemleri", level: 1, count: 12, slug: "dagitim-ve-sartlandirma-sistemleri" },
          { id: "46000000", name: "Kolluk ve Emniyet Ekipmanları", level: 1, count: 40, slug: "kolluk-ve-emniyet-ekipmanlari" },
        ],
        cities: [],
        countries: [],
      },
      faq: [],
      countryLabel: (cc: string) => cc,
      today: "2026-10-09",
    } as never);
    expect(txt).toContain("Dağıtım ve Şartlandırma Sistemleri");
    expect(txt).toContain("/urunler/kategori/40000000-dagitim-ve-sartlandirma-sistemleri");
    expect(txt).not.toMatch(HIDDEN_NAMES);
    expect(txt).not.toContain("46000000");
  });
});
