/**
 * FİRMALAR-ARASI ÜRÜN DİZİNİ — kapı, sızıntı ve KİMLİK sözleşmesi.
 *
 * Dizin, `public-product.spec.ts`ten farklı bir soruyu kilitler: orada kapı
 * TEK firma için sorulur, burada aynı listede farklı firmaların ürünleri yan
 * yana durur. İki iddia kritik:
 *   · kapıdan geçmeyen firmanın ürünü LİSTEYE HİÇ GİRMEZ (404 değil, yok),
 *   · ürün kartı FİRMA ADINI taşır — ilan kartının tam tersi.
 */
import { PublicMarketplaceService } from "../../src/modules/public-marketplace/public-marketplace.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const service = () =>
  new PublicMarketplaceService(prisma as unknown as PrismaBypassService);

/** Ürün kartında ASLA görünmemesi gerekenler (maliyet + iç ölçüt + kimlik). */
const FORBIDDEN = [
  "code",
  "targetPrice",
  "usageCount",
  "lastUsedAt",
  "createdById",
  "completionScore",
  "companyId",
  "isPublic",
  "isActive",
  "searchText",
];

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    v.forEach((x) => allKeys(x, out));
    return out;
  }
  if (v && typeof v === "object" && !(v instanceof Date)) {
    for (const [k, c] of Object.entries(v)) {
      out.add(k);
      allKeys(c, out);
    }
  }
  return out;
}

async function makeCategory(code: string, nameTr: string, level: number) {
  await prisma.category.create({
    data: {
      id: code, code, nameTr, keywords: "", searchText: nameTr.toLowerCase(),
      level, parentId: null, isActive: true, sortOrder: 0,
    },
  });
}

let seq = 0;
async function seedProduct(
  companyOver: Record<string, unknown> = {},
  productOver: Record<string, unknown> = {},
) {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  const patched = await prisma.company.update({
    where: { id: company.id },
    data: {
      name: `Vitrin Sanayi ${seq}`,
      slug: `vitrin-idx-${seq}`,
      city: "İstanbul",
      publicEnabled: true,
      ...companyOver,
    },
  });
  const product = await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      name: `Dağıtım panosu ${seq}`,
      unit: "adet",
      slug: `pano-idx-${seq}`,
      code: "GIZLI-KOD",
      targetPrice: 999,
      categoryId: "39121000",
      description: "x".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
      isPublic: true,
      publishedAt: new Date(),
      searchText: "dagitim panosu pano",
      ...productOver,
    },
  });
  return { company: patched, product };
}

describe("ürün dizini — kapı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("kapıdan geçen ürün listede, kartta FİRMA ADI var", async () => {
    const { company } = await seedProduct();
    const res = await service().listProducts({});
    expect(res.total).toBe(1);
    // İlan kartının tersi: ürün vitrindir, sahibi görünür.
    expect(res.items[0].company.name).toBe(company.name);
    expect(res.items[0].company.slug).toBe(company.slug);
  });

  it("kapıdan geçmeyen firmanın ürünü listeye HİÇ girmez", async () => {
    await seedProduct(); // geçerli
    await seedProduct({ publicEnabled: false });
    await seedProduct({ tier: "STANDART" });
    await seedProduct({ isBlocked: true });
    await seedProduct({ isActive: false });
    const res = await service().listProducts({});
    expect(res.total).toBe(1);
  });

  it("TASLAK ürün listede yok", async () => {
    await seedProduct({}, { isPublic: false, publishedAt: null });
    const res = await service().listProducts({});
    expect(res.total).toBe(0);
  });

  it("slug'ı olmayan ürün listede yok — URL'i kurulamaz", async () => {
    await seedProduct({}, { slug: null });
    expect((await service().listProducts({})).total).toBe(0);
  });

  it("fiyat, MOQ ve Doğrulanmış tiki kartta VAR (v2 — vitrin fiyatıyla vitrindir)", async () => {
    await seedProduct({}, { priceMode: "FIXED", priceAmount: "41000", priceCurrency: "TRY", moq: "5" });
    const res = await service().listProducts({});
    expect(res.items[0].priceAmount).toBe("41000");
    expect(res.items[0].moq).toBe("5");
    expect(res.items[0].company).toHaveProperty("verified");
  });

  it("maliyet ve iç ölçütler karta SIZMAZ", async () => {
    await seedProduct();
    const res = await service().listProducts({});
    const keys = allKeys(res.items);
    for (const f of FORBIDDEN) expect([...keys]).not.toContain(f);
  });

  it("segment öneki KOMŞU segmenti yakalamaz (40 ≠ 41)", async () => {
    // Eski kırpma `40000000` → `4` idi ve 41-49'u da getiriyordu.
    await seedProduct({}, { categoryId: "41101500" });
    await seedProduct({}, { categoryId: "40171501" });
    expect((await service().listProducts({ category: "40000000" })).total).toBe(1);
    expect((await service().listProducts({ category: "41000000" })).total).toBe(1);
  });

  it("kategori süzgeci ATA ZİNCİRİNİ kapsar", async () => {
    await seedProduct({}, { categoryId: "39121000" }); // L3
    await seedProduct({}, { categoryId: "40171501" }); // başka segment
    // Segment (L1) seçimi altındaki yaprakları getirir.
    expect((await service().listProducts({ category: "39000000" })).total).toBe(1);
    expect((await service().listProducts({ category: "40000000" })).total).toBe(1);
    expect((await service().listProducts({ category: "23000000" })).total).toBe(0);
  });

  it("arama TOKENLİ — kelime sırası önemsiz", async () => {
    await seedProduct({}, { searchText: "paslanmaz celik boru dn50" });
    expect((await service().listProducts({ q: "boru paslanmaz" })).total).toBe(1);
    expect((await service().listProducts({ q: "aluminyum" })).total).toBe(0);
  });

  it("şehir süzgeci firma üzerinden çalışır ve kapıyı GEVŞETMEZ", async () => {
    await seedProduct({ city: "Ankara" });
    await seedProduct({ city: "İzmir", publicEnabled: false });
    expect((await service().listProducts({ city: "Ankara" })).total).toBe(1);
    // Kapısı kapalı firmanın şehri sorulsa bile ürün gelmez.
    expect((await service().listProducts({ city: "İzmir" })).total).toBe(0);
  });

  it("nitelik süzgeci TEKLİ ve ÇOKLU değeri birlikte yakalar", async () => {
    // Tekli seçim dize, çoklu seçim dizi olarak saklanıyor. Tek biçim
    // arasaydık süzgeç kategorinin yarısında sessizce boş dönerdi.
    await seedProduct({}, { attributes: { malzeme: "Çelik" } });
    await seedProduct({}, { attributes: { malzeme: ["Alüminyum", "Çelik"] } });
    await seedProduct({}, { attributes: { malzeme: "Bakır" } });
    await seedProduct({}, {}); // niteliksiz
    expect((await service().listProducts({ attr: ["malzeme:Çelik"] })).total).toBe(2);
    expect((await service().listProducts({ attr: ["malzeme:Bakır"] })).total).toBe(1);
    expect((await service().listProducts({ attr: ["malzeme:Titanyum"] })).total).toBe(0);
  });

  it("birden çok nitelik AND'lenir", async () => {
    await seedProduct({}, { attributes: { malzeme: "Çelik", standart: ["EN", "ISO"] } });
    await seedProduct({}, { attributes: { malzeme: "Çelik", standart: ["DIN"] } });
    const both = await service().listProducts({
      attr: ["malzeme:Çelik", "standart:EN"],
    });
    expect(both.total).toBe(1);
  });

  it("bozuk nitelik girdisi sessizce düşer, sorguyu bozmaz", async () => {
    await seedProduct({}, { attributes: { malzeme: "Çelik" } });
    // Ayraçsız / boş değerli girdiler koşul üretmemeli.
    const res = await service().listProducts({ attr: ["malzeme", "malzeme:   ", ":Çelik"] });
    expect(res.total).toBe(1);
  });

  it("nitelik facet'i YALNIZ kategori seçiliyken döner", async () => {
    await makeCategory("39000000", "Elektrik Sistemleri", 1);
    await prisma.categoryAttribute.create({
      data: {
        categoryId: "39000000", groupKey: "koruma_sinifi", nameTr: "Koruma sınıfı (IP)",
        type: "SINGLE_SELECT", options: ["IP54", "IP65"], unit: null, isRequired: false, sortOrder: 0,
      },
    });
    await seedProduct({}, { categoryId: "39121000", attributes: { koruma_sinifi: "IP65" } });
    await seedProduct({}, { categoryId: "39121000", attributes: { koruma_sinifi: "IP65" } });
    await seedProduct({}, { categoryId: "39121000", attributes: { koruma_sinifi: "IP54" } });

    // Kategorisiz: nitelik süzgeci gösterilmez.
    expect((await service().productFacets({})).attributes).toEqual([]);

    const f = await service().productFacets({ category: "39000000" });
    expect(f.attributes).toHaveLength(1);
    expect(f.attributes[0].key).toBe("koruma_sinifi");
    expect(f.attributes[0].values).toEqual([
      { value: "IP65", count: 2 },
      { value: "IP54", count: 1 },
    ]);
  });

  it("nitelik facet'i MİRASI okur ve serbest metni saymaz", async () => {
    await makeCategory("40000000", "Dağıtım Sistemleri", 1);
    await prisma.categoryAttribute.createMany({
      data: [
        {
          categoryId: "40000000", groupKey: "malzeme", nameTr: "Malzeme",
          type: "MULTI_SELECT", options: ["Çelik", "PVC"], isRequired: false, sortOrder: 0,
        },
        {
          categoryId: "40000000", groupKey: "tolerans", nameTr: "Tolerans",
          type: "TEXT", options: [], isRequired: false, sortOrder: 1,
        },
      ],
    });
    // Ürün L4 yaprakta — tanım L1 segmentte; miras zinciri çalışmalı.
    await seedProduct({}, {
      categoryId: "40171501",
      attributes: { malzeme: ["Çelik"], tolerans: "±0,1 mm" },
    });
    const f = await service().productFacets({ category: "40000000" });
    expect(f.attributes.map((a) => a.key)).toEqual(["malzeme"]); // TEXT sayılmaz
    expect(f.attributes[0].values).toEqual([{ value: "Çelik", count: 1 }]);
  });

  it("değeri olmayan nitelik facet'te GÖRÜNMEZ", async () => {
    await makeCategory("39000000", "Elektrik Sistemleri", 1);
    await prisma.categoryAttribute.create({
      data: {
        categoryId: "39000000", groupKey: "gerilim", nameTr: "Gerilim",
        type: "SINGLE_SELECT", options: ["AG", "OG"], isRequired: false, sortOrder: 0,
      },
    });
    await seedProduct({}, { categoryId: "39121000", attributes: {} });
    // Hiçbir ürün doldurmamış → hiçbir şeyi daraltmayan satır gösterilmez.
    expect((await service().productFacets({ category: "39000000" })).attributes).toEqual([]);
  });

  it("kategori sayfasında SEKTÖR listesi daralmaz — başka sektöre geçilebilmeli", async () => {
    await makeCategory("39000000", "Elektrik Sistemleri", 1);
    await makeCategory("40000000", "Dağıtım Sistemleri", 1);
    await seedProduct({}, { categoryId: "39121000" });
    await seedProduct({}, { categoryId: "40171501" });
    // Elektrik kategorisindeyken bile iki sektör de sayaçta görünmeli.
    const f = await service().productFacets({ category: "39000000" });
    expect(f.categories.map((c) => c.id).sort()).toEqual(["39000000", "40000000"]);
  });

  it("facet sayaçları yalnız kapıdan geçenleri sayar", async () => {
    await seedProduct({ city: "Bursa" });
    await seedProduct({ city: "Bursa", publicEnabled: false });
    const f = await service().productFacets({});
    expect(f.cities.find((c) => c.city === "Bursa")?.count).toBe(1);
    expect(f.truncated).toBe(false);
  });
});

/** v2 uçları: seçki, ilişkili bloklar, öneri, sayı şeridi. */
describe("v2 — seçki / ilişkili / öneri / sayılar", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("seçki: aynı firmadan en fazla 2, doğrulanmış önce", async () => {
    const { company } = await seedProduct({ companyVerificationStatus: "UNVERIFIED" }, { name: "A1" });
    await prisma.companyItem.create({
      data: {
        companyId: company.id, createdById: (await prisma.companyUser.findFirstOrThrow({ where: { companyId: company.id } })).id,
        name: "A2", unit: "adet", slug: "a2", isPublic: true, publishedAt: new Date(), images: ["x.webp"], searchText: "a2",
      },
    });
    await prisma.companyItem.create({
      data: {
        companyId: company.id, createdById: (await prisma.companyUser.findFirstOrThrow({ where: { companyId: company.id } })).id,
        name: "A3", unit: "adet", slug: "a3", isPublic: true, publishedAt: new Date(), images: ["x.webp"], searchText: "a3",
      },
    });
    await seedProduct({ companyVerificationStatus: "VERIFIED" }, { name: "B1" });
    const out = await service().featuredProducts(10);
    expect(out[0].name).toBe("B1");
    expect(out.filter((c) => c.company.slug === company.slug)).toHaveLength(2);
  });

  it("ilişkili: firmanın diğerleri + benzer (farklı firma) + kategoride yeni", async () => {
    const { company, product } = await seedProduct({}, { categoryId: "39121000", slug: "base" });
    await prisma.companyItem.create({
      data: {
        companyId: company.id, createdById: (await prisma.companyUser.findFirstOrThrow({ where: { companyId: company.id } })).id,
        name: "Aynı firma", unit: "adet", slug: "ayni", isPublic: true, publishedAt: new Date(), images: ["x.webp"], searchText: "ayni", categoryId: "39121000",
      },
    });
    await seedProduct({}, { categoryId: "39121500", name: "Benzer" });
    await seedProduct({}, { categoryId: "40171501", name: "Uzak" });
    const rel = await service().relatedProducts(company.slug as string, product.slug as string);
    expect(rel.fromCompany.total).toBe(1);
    expect(rel.similar.map((c) => c.name)).toEqual(["Benzer"]);
    expect(rel.popular.map((c) => c.name)).not.toContain("Uzak");
    await expect(service().relatedProducts("yok", "yok")).rejects.toThrow(/bulunamadı/);
  });

  it("öneri: ürün + firma; kısa sorgu boş", async () => {
    await seedProduct({ name: "Pano Sanayi" }, { name: "Dağıtım panosu", searchText: "dagitim panosu" });
    const s = await service().suggest("pano");
    expect(s.products.map((p) => p.name)).toContain("Dağıtım panosu");
    expect(s.companies.map((c) => c.name)).toContain("Pano Sanayi");
    expect(await service().suggest("p")).toEqual({ products: [], categories: [], companies: [] });
  });

  it("sayı şeridi gerçek sayımlar", async () => {
    await seedProduct();
    const st = await service().stats();
    expect(st.products).toBe(1);
    expect(st.companies).toBe(1);
    expect(st).toHaveProperty("openDemands");
  });
});

/** Bağlama duyarlı facet + çoklu seçim + fiyat aralığı (2026-09-04, süzgeç v3). */
describe("süzgeç v3 — çoklu seçim, aralık, bağlama duyarlı facet", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("şehir ve faaliyet virgüllü çoklu (OR); fiyat aralığı ve MOQ tavanı", async () => {
    await seedProduct({ city: "İstanbul", activities: ["MANUFACTURER"] }, { name: "A", priceMode: "FIXED", priceAmount: "100", moq: "5" });
    await seedProduct({ city: "İzmir", activities: ["DISTRIBUTOR"] }, { name: "B", priceMode: "FIXED", priceAmount: "900", moq: "500" });
    await seedProduct({ city: "Ankara", activities: ["SERVICE_PROVIDER"] }, { name: "C" });
    expect((await service().listProducts({ city: "İstanbul,İzmir" })).total).toBe(2);
    expect((await service().listProducts({ activity: "MANUFACTURER,DISTRIBUTOR" })).total).toBe(2);
    expect((await service().listProducts({ priceMin: 500 })).items.map((p) => p.name)).toEqual(["B"]);
    expect((await service().listProducts({ priceMax: 500 })).items.map((p) => p.name)).toEqual(["A"]);
    // MOQ tavanı: MOQ'suz ürün (C) de geçer.
    expect((await service().listProducts({ moqMax: 10 })).items.map((p) => p.name).sort()).toEqual(["A", "C"]);
    expect((await service().listProducts({ sort: "price_desc" })).items[0].name).toBe("B");
  });

  it("facet sayıları diğer seçimlere göre; kendi boyutu hariç", async () => {
    await seedProduct({ city: "İstanbul", activities: ["MANUFACTURER"] }, { name: "A" });
    await seedProduct({ city: "İzmir", activities: ["MANUFACTURER"] }, { name: "B" });
    await seedProduct({ city: "İzmir", activities: ["DISTRIBUTOR"] }, { name: "C" });
    const f = await service().productFacets({ activity: "MANUFACTURER" });
    // Şehir sayaçları faaliyet süzgeciyle daralır (C düşer).
    expect([...f.cities].sort((a, b) => a.city.localeCompare(b.city))).toEqual([
      { city: "İstanbul", count: 1 },
      { city: "İzmir", count: 1 },
    ]);
    // Faaliyet sayaçları KENDİ seçimini hariç tutar: DISTRIBUTOR hâlâ görünür.
    expect(f.activities.find((a) => a.activity === "DISTRIBUTOR")?.count).toBe(1);
  });
});
