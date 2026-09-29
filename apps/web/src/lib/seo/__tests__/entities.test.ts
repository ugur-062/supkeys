import {
  companySeo as companySeo0,
  companyTitle,
  listingSeo as listingSeo0,
  listingSeoInput,
  productSeo as productSeo0,
  type CompanySeoInput,
  type ListingSeoInput,
  type ProductSeoInput,
} from "@/lib/seo/entities";
import { seoT } from "@/i18n/server";
import { clampDescription, joinParts } from "@/lib/seo/meta";
import { compact } from "@/lib/seo/jsonld";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site-url", () => ({ resolveSiteUrl: () => "https://www.rothern.com" }));

// Üreticiler çevirmeni parametre alır (server-only zinciri istemciye girmesin); testte TR.
const T = { t: seoT("tr") };
const productSeo = (i: ProductSeoInput) => productSeo0(i, T);
const companySeo = (i: CompanySeoInput) => companySeo0(i, T);
const listingSeo = (i: ListingSeoInput) => listingSeo0(i, T);

/**
 * SEO/GEO SÖZLEŞMESİ.
 *
 * En tehlikeli hata yapılandırılmış veriye SIZINTI: JSON-LD sayfada
 * görünmeyen bir katman olduğu için gözle fark edilmez, ama makine okur.
 * Alım talebinde sahibin adını gizleyip aynı adı `Demand` düğümüne yazmak,
 * gizlemeyi anlamsız kılar (CLAUDE.md § İLAN SAHİBİ ANONİM).
 */

const product = {
  name: "Plakalı Isı Eşanjörü 150 kW",
  slug: "plakali-isi-esanjoru-150-kw",
  description: "Contalı plakalı ısı eşanjörü 150 kW, AISI 316 plaka, EPDM conta.",
  images: ["/categories/40000000.webp"],
  brand: null,
  mpn: null,
  unit: "adet",
  moq: "1",
  priceMode: "FIXED" as const,
  priceAmount: "96000",
  priceTiers: null,
  priceCurrency: "TRY",
  category: { id: "40101700", name: "Isı eşanjörleri" },
  attributeList: [{ label: "Malzeme", value: "AISI 316", unit: null }],
  keywords: ["eşanjör", "ısı"],
};
const company = {
  name: "İzmir Makina Endüstri A.Ş.",
  slug: "izmir-makina-endustri",
  city: "İzmir",
  country: "TR",
  industry: "Makine",
};

describe("productSeo", () => {
  const seo = productSeo({ companySlug: "izmir-makina-endustri", product, company, indexable: true });
  const node = (seo.jsonLd["@graph"] as Record<string, unknown>[])[0];

  it("başlık, açıklama ve kanonik üretir", () => {
    expect(seo.metadata.title).toContain(product.name);
    expect(seo.metadata.alternates?.canonical).toBe(
      "https://www.rothern.com/firma/izmir-makina-endustri/urun/plakali-isi-esanjoru-150-kw",
    );
    expect(String(seo.metadata.description ?? "").length).toBeLessThanOrEqual(160);
  });

  it("özet cümlesi olguları taşır (GEO alıntısı)", () => {
    expect(seo.summary).toContain("Isı eşanjörleri");
    expect(seo.summary).toContain("İzmir");
    expect(seo.summary).toMatch(/min\. 1 adet/i);
  });

  it("görseller MUTLAK adres olur", () => {
    expect((node.image as string[])[0]).toBe("https://www.rothern.com/categories/40000000.webp");
  });

  it("satıcı kimliği ÜRÜNDE açıktır (vitrin opt-in)", () => {
    const seller = (node.offers as Record<string, unknown>).seller as Record<string, unknown>;
    expect(seller.name).toBe(company.name);
  });

  it("teklif usulü fiyatta UYDURMA fiyat yazılmaz", () => {
    const onRequest = productSeo({
      companySlug: "x",
      product: { ...product, priceMode: "ON_REQUEST", priceAmount: null },
      company,
      indexable: true,
    });
    // Fiyatsız Offer Rich Results hatasıdır → teklif düğümü HİÇ yazılmaz (2026-09-27).
    expect((onRequest.jsonLd["@graph"] as Record<string, unknown>[])[0]).not.toHaveProperty("offers");
    expect(JSON.stringify(onRequest.jsonLd)).not.toContain("InStock");
    expect(onRequest.summary).toContain("teklif isteyin");
  });
});

describe("companySeo", () => {
  const seo = companySeo({
    slug: "izmir-makina-endustri",
    name: company.name,
    industry: "Makine",
    city: "İzmir",
    country: "TR",
    aboutText: "1998'den beri endüstriyel ısı transfer ekipmanları üretiyoruz.",
    logoUrl: "https://cdn.rothern.com/logo.png",
    coverImageUrl: null,
    foundedYear: 1998,
    employeeCount: "11-50",
    categories: [{ id: "40000000", name: "Isıtma ve soğutma" }],
    certifications: ["ISO 9001"],
    verified: true,
    productCount: 12,
    products: [{ name: "Eşanjör", slug: "esanjor" }],
  });
  const raw = JSON.stringify(seo.jsonLd);
  const node = (seo.jsonLd["@graph"] as Record<string, unknown>[])[0];

  it("çalışan sayısı ARALIK olduğu için sayı gibi yazılmaz", () => {
    expect(node.numberOfEmployees).toEqual({ "@type": "QuantitativeValue", name: "11-50" });
  });

  it("vitrin katalogu ürünleri taşır", () => {
    expect(raw).toContain("OfferCatalog");
    expect(raw).toContain("/firma/izmir-makina-endustri/urun/esanjor");
  });

  it("oy sayısı olmadığı için aggregateRating YAZILMAZ", () => {
    expect(raw).not.toContain("aggregateRating");
  });
});

describe("companySeo — sameAs (dış kimlik)", () => {
  const base = {
    slug: "acme",
    name: "Acme",
    industry: null,
    city: null,
    country: null,
    aboutText: null,
    logoUrl: null,
    coverImageUrl: null,
    foundedYear: null,
    employeeCount: null,
    categories: [],
    productCount: 0,
  };
  const org = (input: Parameters<typeof companySeo>[0]) =>
    (companySeo(input).jsonLd as { "@graph": Record<string, unknown>[] })["@graph"][0];

  it("web sitesi ve LinkedIn http(s) ise sameAs olur; geçersiz/boş yazılmaz", () => {
    expect(org({ ...base, website: "https://acme.com.tr", linkedinUrl: "https://linkedin.com/company/acme" }).sameAs).toEqual([
      "https://acme.com.tr",
      "https://linkedin.com/company/acme",
    ]);
    expect(org({ ...base, website: "acme.com.tr", linkedinUrl: "" })).not.toHaveProperty("sameAs");
    expect(org(base)).not.toHaveProperty("sameAs");
  });
});

describe("listingSeo — sahip ANONİM kalır", () => {
  const listing = {
    number: "ROT-000159",
    title: "İhracat için karton koli ve plastik kasa alımı",
    description: "Aylık düzenli sevkiyat için ambalaj alımı.",
    closesAt: "2026-09-20T00:00:00.000Z",
    status: "OPEN",
    indexable: true,
    itemSummary: { count: 2, totalQuantity: "312000", unit: "adet" },
    categories: [{ id: "24100000", name: "Ambalaj malzemeleri" }],
    isInternational: false,
    coverImageUrl: null,
    company: { city: "Antalya", country: "TR" },
  };
  const seo = listingSeo(listingSeoInput(listing));
  const raw = JSON.stringify(seo.jsonLd);

  it("satıcı/sunan düğümü HİÇ yazılmaz", () => {
    expect(raw).not.toContain('"seller"');
    expect(raw).not.toContain("offeredBy");
    expect(raw).not.toContain("provider");
  });

  it("konum ve miktar kalır (sayfada da görünüyor)", () => {
    expect(raw).toContain("Antalya");
    expect(raw).toContain("312000");
  });

  it("kapanmış talep şemada da kapalı görünür", () => {
    const closed = listingSeo(listingSeoInput({ ...listing, status: "CLOSED", indexable: false }));
    expect(JSON.stringify(closed.jsonLd)).toContain("Discontinued");
    expect(closed.metadata.robots).toMatchObject({ index: false });
  });
});

describe("yardımcılar", () => {
  it("clampDescription kelime sınırında keser", () => {
    const out = clampDescription("bir iki üç dört beş altı yedi sekiz dokuz on", 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
    // Kelime ORTASINDAN kesilmemeli: "dör…" değil, son tam kelimeden sonra.
    expect(out).toBe("bir iki üç dört…");
  });

  it("joinParts boş parçaları atar", () => {
    expect(joinParts(["a", null, "", undefined, "b"])).toBe("a · b");
  });

  it("compact boş alanları düğümden düşürür", () => {
    expect(compact({ a: "x", b: undefined, c: "", d: [] })).toEqual({ a: "x" });
  });
});

describe("companyTitle — 75 karakter tavanı (SEO denetimi 2026-09-26)", () => {
  it("sığarsa ad — sektör, şehir; sığmazsa önce şehir, sonra sektör düşer", () => {
    expect(companyTitle("Acme Metal", "Steel pipes", "Izmir")).toBe("Acme Metal — Steel pipes, Izmir");
    const long = companyTitle("Antalya Tarım Ürünleri Koop.", "Agriculture and greenhouse farming", "Antalya");
    expect(long).toBe("Antalya Tarım Ürünleri Koop. — Agriculture and greenhouse farming");
    expect(`${long} · Rothern`.length).toBeLessThanOrEqual(75);
    expect(companyTitle("Acme", "x".repeat(90), "Bursa")).toBe("Acme — Bursa");
    expect(companyTitle("Acme", null, null)).toBe("Acme");
  });
});

describe("çok dilli graf (2026-09-27 SEO denetimi)", () => {
  const S = "https://www.rothern.com";
  const EN = { locale: "en" as const, t: seoT("en") };
  const graphOf = (ld: Record<string, unknown>) => ld["@graph"] as Record<string, unknown>[];

  it("ürün: varlık @id dilden bağımsız, sayfa düğümü ItemPage dilli; varlıkta inLanguage yok", () => {
    const tr = graphOf(productSeo0({ companySlug: "acme", product, company, indexable: true }, T).jsonLd);
    const en = graphOf(productSeo0({ companySlug: "acme", product, company, indexable: true }, EN).jsonLd);
    expect(tr[0]!["@id"]).toBe(`${S}/firma/acme/urun/plakali-isi-esanjoru-150-kw#product`);
    expect(en[0]!["@id"]).toBe(tr[0]!["@id"]);
    expect(en[0]).not.toHaveProperty("inLanguage");
    const page = en.find((n) => n["@type"] === "ItemPage")!;
    expect(page["@id"]).toBe(`${S}/en/companies/acme/products/plakali-isi-esanjoru-150-kw`);
    expect(page.inLanguage).toBe("en-US");
    expect(page.mainEntity).toEqual({ "@id": tr[0]!["@id"] });
    expect(page.isPartOf).toEqual({ "@id": `${S}/#website` });
  });

  it("satıcı adresi okuyucunun dilinde, kimliği firma sayfasıyla aynı; birim etiketi dilde", () => {
    const seo = productSeo0({ companySlug: "acme", product: { ...product, unitCode: "PCE" }, company, indexable: true }, EN);
    const node = graphOf(seo.jsonLd)[0]!;
    const seller = (node.offers as Record<string, unknown>).seller as Record<string, unknown>;
    expect(seller.url).toBe(`${S}/en/companies/izmir-makina-endustri`);
    expect(seller["@id"]).toBe(`${S}/firma/izmir-makina-endustri#company`);
    expect(seo.summary).not.toContain("adet");
    expect(seo.summary).not.toContain("vitrininde");
    expect(String(seo.metadata.description)).not.toMatch(/\badet\b/);
  });

  it("kademeli fiyat → AggregateOffer (en düşük/en yüksek); kırıntı SEGMENT açılış sayfasına", () => {
    const seo = productSeo0({
      companySlug: "acme",
      product: {
        ...product,
        priceMode: "TIERED",
        priceAmount: null,
        priceTiers: [{ minQty: 1, unitPrice: 120 }, { minQty: 100, unitPrice: 90 }],
        segment: { id: "40000000", name: "Isıtma", slug: "isitma" },
      },
      company,
      indexable: true,
    }, T);
    const g = graphOf(seo.jsonLd);
    expect(g[0]!.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 90, highPrice: 120, offerCount: 2 });
    const crumbs = (g.find((n) => n["@type"] === "BreadcrumbList")!.itemListElement as { item: string }[]).map((i) => i.item);
    expect(crumbs).toContain(`${S}/urunler/kategori/40000000-isitma`);
    expect(crumbs.some((u) => u.includes("?kategori="))).toBe(false);
  });

  it("hreflang yalnız hazır diller (API readyLocales)", () => {
    const seo = productSeo0({ companySlug: "acme", product: { ...product, readyLocales: ["tr", "ru"], sourceLocale: "tr" }, company, indexable: true }, T);
    expect(Object.keys(seo.metadata.alternates?.languages ?? {})).toEqual(["tr", "ru", "x-default"]);
  });

  it("firma: areaServed yok, ülke yoksa addressCountry UYDURULMAZ, katalog adresleri dilde, kapaksız OG kartı kendi kartı", () => {
    const seo = companySeo0({
      slug: "acme",
      name: "Acme GmbH",
      industry: null,
      city: "Munich",
      country: null,
      aboutText: null,
      logoUrl: "https://cdn.rothern.com/logo.png",
      coverImageUrl: null,
      foundedYear: null,
      employeeCount: null,
      categories: [],
      productCount: 1,
      products: [{ name: "Pump", slug: "pump" }],
    }, EN);
    const g = graphOf(seo.jsonLd);
    const org = g[0]!;
    expect(org).not.toHaveProperty("areaServed");
    expect(org).not.toHaveProperty("inLanguage");
    expect(org["@id"]).toBe(`${S}/firma/acme#company`);
    expect((org.address as Record<string, unknown>).addressCountry).toBeUndefined();
    expect(JSON.stringify(org.hasOfferCatalog)).toContain(`${S}/en/companies/acme/products/pump`);
    expect(g.find((n) => n["@type"] === "ProfilePage")?.inLanguage).toBe("en-US");
    expect(seo.metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: `${S}/en/firma/acme/opengraph-image`, width: 1200, height: 630 }),
    ]);
    const de = graphOf(companySeo0({ slug: "acme", name: "Acme GmbH", industry: null, city: "Munich", country: "DE", aboutText: null, logoUrl: null, coverImageUrl: null, foundedYear: null, employeeCount: null, categories: [], productCount: 0 }, EN).jsonLd)[0]!;
    expect((de.address as Record<string, unknown>).addressCountry).toBe("DE");
  });

  it("talep: görsel yoksa talebin kendi OG kartı; Demand @id dilden bağımsız; kaynak dilde gösterimde inLanguage kaynağın", () => {
    const l = {
      number: "ROT-000159",
      slug: "rot-000159-karton-koli",
      title: "Karton koli",
      description: null,
      closesAt: null,
      status: "OPEN",
      indexable: false,
      itemSummary: { count: 1, totalQuantity: "10", unit: "adet" },
      categories: [],
      isInternational: false,
      coverImageUrl: null,
      company: { city: "Antalya", country: "TR" },
      readyLocales: ["tr"],
      sourceLocale: "tr",
    };
    const seo = listingSeo0(listingSeoInput(l), EN);
    const g = graphOf(seo.jsonLd);
    expect(g[0]!["@id"]).toBe(`${S}/talep/rot-000159-karton-koli#demand`);
    expect(g.find((n) => n["@type"] === "ItemPage")?.inLanguage).toBe("tr");
    expect(seo.metadata.openGraph?.images).toEqual([expect.objectContaining({ url: `${S}/en/talep/rot-000159-karton-koli/opengraph-image` })]);
    expect(JSON.stringify(g[0])).toContain("piece");
    // Derin denetim S094: meta açıklaması çoğul kuralla ("10 pieces", "10 piece" değil).
    expect(String(seo.metadata.description)).toContain("Quantity: 10 pieces");
  });
});
