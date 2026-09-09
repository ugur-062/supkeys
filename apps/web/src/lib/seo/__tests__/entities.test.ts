import { companySeo, listingSeo, listingSeoInput, productSeo } from "@/lib/seo/entities";
import { clampDescription, joinParts } from "@/lib/seo/meta";
import { compact } from "@/lib/seo/jsonld";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site-url", () => ({ resolveSiteUrl: () => "https://www.rothern.com" }));

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
    expect(seo.summary).toMatch(/min\. 1 adet/);
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
    const offer = ((onRequest.jsonLd["@graph"] as Record<string, unknown>[])[0].offers) as Record<string, unknown>;
    expect(offer.price).toBeUndefined();
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
