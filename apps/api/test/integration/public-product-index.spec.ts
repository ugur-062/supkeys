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
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { resolveCityId } from "../../src/common/geo/geo-index";
// Çalışan kovası süzgeci `employeeCount` DISTINCT değerlerini 15 dk önbelleğe
// alır; her test kendi firmalarını kurduğu için önbellek turlar arasında
// bayat kalır ve süzgeç boş dönerdi.
import { resetEmployeeValueCache } from "../../src/common/company/product-index";
import { foldSearchText, productPriceBase } from "@rothern/shared";
import { fxRate, resetFxRates, setFxRates } from "../../src/common/currency/fx-rates";

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
  "searchTextI18n",
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
      // Gerçek yazma yolu gibi (2026-09-27): süzgeç/facet `cityId` okur.
      cityId: resolveCityId("TR", (companyOver.city as string | undefined) ?? "İstanbul"),
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
      // Gerçek yazma yolu gibi (2026-09-27): fiyat süzgeci/sıralaması TRY
      // karşılığını (`priceAmountBase`) okur.
      priceAmountBase: productPriceBase(
        {
          priceMode: (productOver.priceMode as string | undefined) ?? "ON_REQUEST",
          priceAmount: productOver.priceAmount ?? null,
          priceTiers: productOver.priceTiers ?? null,
          priceCurrency: (productOver.priceCurrency as string | undefined) ?? "TRY",
        },
        fxRate,
      ),
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

  it("kapıdan geçmeyen firmanın ürünü listeye HİÇ girmez (paket şartı YOK — Standart da listelenir)", async () => {
    await seedProduct(); // geçerli
    await seedProduct({ publicEnabled: false });
    await seedProduct({ tier: "STANDART" }); // 2026-09-06: ücretsiz firma da dizinde
    await seedProduct({ isBlocked: true });
    await seedProduct({ isActive: false });
    const res = await service().listProducts({});
    expect(res.total).toBe(2);
  });

  it("SIRA: paketli firmanın ürünü ücretsiz firmanınkinden ÖNCE (uygunluk ve en yeni sıralamada)", async () => {
    const free = await seedProduct({ tier: "STANDART" }, { completionScore: 100, publishedAt: new Date() });
    const paid = await seedProduct({ tier: "SILVER" }, { completionScore: 40, publishedAt: new Date(Date.now() - 86_400_000) });
    const byRelevance = await service().listProducts({});
    expect(byRelevance.items.map((p) => p.company.slug)).toEqual([paid.company.slug, free.company.slug]);
    const byNewest = await service().listProducts({ sort: "newest" });
    expect(byNewest.items.map((p) => p.company.slug)).toEqual([paid.company.slug, free.company.slug]);
    // Açık fiyat sıralaması paketten bağımsız kalır.
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
    // Facet değeri şehrin KALICI ADRESİ, `name` görünen ad (2026-09-27).
    expect(f.cities.find((c) => c.city === "bursa")).toMatchObject({ name: "Bursa", country: "TR", count: 1 });
    expect(f.truncated).toBe(false);
  });

  it("satıcı ülkesi sayaçları yanıtta; ülke seçiliyken de diğer ülkeler sayılır (MU-10)", async () => {
    await seedProduct();
    await seedProduct();
    await seedProduct({ country: "DE" });
    await seedProduct({ country: "DE", publicEnabled: false });
    expect((await service().productFacets({})).countries).toEqual([
      { country: "TR", count: 2 },
      { country: "DE", count: 1 },
    ]);
    expect((await service().productFacets({ country: "DE" })).countries).toEqual([
      { country: "TR", count: 2 },
      { country: "DE", count: 1 },
    ]);
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
    // "Kategoride yeni" KENDİ firmasını basmaz (2026-09-07): dışlanmasaydı
    // alıcı karşılaştıracak başka tedarikçi göremezdi.
    expect(rel.popular.map((c) => c.company.slug)).not.toContain(company.slug);
    expect(rel.popular.map((c) => c.name)).toContain("Benzer");
    await expect(service().relatedProducts("yok", "yok")).rejects.toThrow(/bulunamadı/);
  });

  it("ilişkili (panel, arayüz testi D-231): görüntüleyenin kendi ürünü ve engel ilişkili firmalar 'diğer tedarikçiler'de yok", async () => {
    const { company, product } = await seedProduct({}, { categoryId: "39121000", slug: "base-d231" });
    const viewer = await seedProduct({}, { categoryId: "39121500", name: "Kendi urunum" });
    const blockedCo = await seedProduct({}, { categoryId: "39121500", name: "Engelli urun" });
    await seedProduct({}, { categoryId: "39121500", name: "Baska tedarikci" });
    await prisma.companyBlock.create({ data: { blockerCompanyId: blockedCo.company.id, blockedCompanyId: viewer.company.id } });
    const panel = new PublicProfileService(prisma as never);
    // Herkese açık uç görüntüleyeni bilmez — üçü de listelenir.
    const anon = await panel.related(company.slug as string, product.slug as string);
    expect(anon.similar.map((c) => c.name).sort()).toEqual(["Baska tedarikci", "Engelli urun", "Kendi urunum"]);
    const rel = await panel.relatedForViewer(viewer.company.id, company.slug as string, product.slug as string);
    expect(rel.similar.map((c) => c.name)).toEqual(["Baska tedarikci"]);
    expect(rel.popular.map((c) => c.name)).not.toContain("Kendi urunum");
    expect(rel.popular.map((c) => c.name)).not.toContain("Engelli urun");
    // Ürünün kendi firması engel ilişkiliyse 404 (panel ürün sayfasıyla aynı).
    await expect(
      panel.relatedForViewer(viewer.company.id, blockedCo.company.slug as string, blockedCo.product.slug as string),
    ).rejects.toThrow(/bulunamadı/);
  });

  it("ilişkili: engelli firmanın ürünü 404 (firma slug'ı profil kapısını ezmez)", async () => {
    const { company, product } = await seedProduct({}, { slug: "engelli-urun" });
    await expect(service().relatedProducts(company.slug as string, product.slug as string)).resolves.toBeTruthy();
    await prisma.company.update({ where: { id: company.id }, data: { isBlocked: true } });
    await expect(service().relatedProducts(company.slug as string, product.slug as string)).rejects.toThrow(/bulunamadı/);
  });

  it("öneri: ürün + firma; kısa sorgu boş", async () => {
    await seedProduct({ name: "Pano Sanayi" }, { name: "Dağıtım panosu", searchText: "dagitim panosu" });
    const s = await service().suggest("pano");
    expect(s.products.map((p) => p.name)).toContain("Dağıtım panosu");
    expect(s.companies.map((c) => c.name)).toContain("Pano Sanayi");
    // Kart satırı için görsel + firma adı (PROMPT 6 typeahead).
    expect(s.products[0]).toMatchObject({ image: "a.webp", companyName: "Pano Sanayi" });
    expect(await service().suggest("p")).toEqual({ products: [], categories: [], companies: [], listings: [] });
  });

  it("öneri kapsamı: scope yalnız o grubu sorgular (kategori her kapsamda)", async () => {
    await seedProduct({ name: "Pano Sanayi" }, { name: "Dağıtım panosu", searchText: "dagitim panosu" });
    const onlyCompanies = await service().suggest("pano", "companies");
    expect(onlyCompanies.companies.map((c) => c.name)).toContain("Pano Sanayi");
    expect(onlyCompanies.products).toEqual([]);
    const onlyProducts = await service().suggest("pano", "products");
    expect(onlyProducts.products.map((p) => p.name)).toContain("Dağıtım panosu");
    expect(onlyProducts.companies).toEqual([]);
  });

  it("öneri: kategori kökle aranır (kategori aramasıyla aynı kural) ve % / _ joker değildir", async () => {
    await prisma.category.createMany({
      data: [
        { id: "40000000", code: "40000000", nameTr: "Dağıtım Sistemleri", searchText: "dagitim sistemleri", level: 1, inDiscovery: true },
        { id: "40170000", code: "40170000", nameTr: "Çelik boru ve bağlantı", searchText: "celik boru ve baglanti steel pipe", level: 2, parentId: "40000000", inDiscovery: true },
        { id: "40171500", code: "40171500", nameTr: "Vana grubu", searchText: "vana grubu", level: 3, parentId: "40170000", inDiscovery: true },
      ],
    });
    const names = async (q: string) => (await service().suggest(q)).categories.map((c) => c.name);
    // Yalın biçim (önceki davranış) + Türkçe ek + İngilizce çoğul.
    expect(await names("çelik boru")).toEqual(["Çelik boru ve bağlantı"]);
    expect(await names("çelik boruları")).toEqual(["Çelik boru ve bağlantı"]);
    expect(await names("steel pipes")).toEqual(["Çelik boru ve bağlantı"]);
    // Kelimelerden biri hiçbir biçimde geçmiyorsa öneri yok (AND).
    expect(await names("çelik hidrolikleri")).toEqual([]);
    // Joker yok: "%%" her kategoriyle, "va_a" "vana" ile eşleşirdi.
    expect(await names("%%")).toEqual([]);
    expect(await names("va_a")).toEqual([]);
  });

  it("öneri: yazılan kelimeyi taşıyan kategori ÖNCE, yalnız kökle gelen kalan yeri doldurur; 4 karakterden kısa kök kullanılmaz", async () => {
    const cat = (id: string, nameTr: string, level: number, keywords = "") => ({
      id, code: id, nameTr, searchText: foldSearchText(`${nameTr} ${keywords}`), level, inDiscovery: true,
    });
    // "kaplin" → kök "kapl" (kaplama / kaplı / kaplar): beş AİLE yalnız kökle
    // eşleşir. Öneri düzeye göre sıralandığı için beş yerin hepsini onlar
    // alıyor, hiçbir kaplin önerilmiyordu.
    const kokle = [
      cat("14110000", "Lamine kağıtlar", 2, "kaplama"),
      cat("14120000", "Kuşe kağıtlar", 2, "kaplı kağıt"),
      cat("24110000", "Konteynerler ve depolama ürünleri", 2, "kaplar"),
      cat("30130000", "Taş kaplamalar", 2),
      cat("72150000", "Yüzey kaplama hizmetleri", 2),
    ];
    await prisma.category.createMany({
      data: [
        ...kokle,
        cat("31163000", "Kaplinler", 3),
        cat("40141700", "Akış kaplinleri", 3),
        // "cıvata" → kök "civa": aile yalnız eş anlamlısındaki "cıva" ile eşleşir.
        cat("76120000", "Toksik ve tehlikeli atık temizliği", 2, "cıva"),
        cat("31161600", "Cıvatalar", 3),
        cat("31171500", "Rulmanlar ve yataklar", 3),
        // "copies" → kök "cop" (3 karakter): "copper" ile eşleşiyordu.
        cat("31130000", "Bakır dövme parçalar", 2, "copper forgings"),
      ],
    });
    const names = async (q: string) => (await service().suggest(q)).categories.map((c) => c.name);

    const kaplin = await names("kaplin");
    expect(kaplin).toHaveLength(5);
    expect(kaplin.slice(0, 2).sort()).toEqual(["Akış kaplinleri", "Kaplinler"]);
    // Kalan üç yer kökle gelenlerden; aynı kategori iki kez önerilmez.
    expect(kokle.map((c) => c.nameTr)).toEqual(expect.arrayContaining(kaplin.slice(2)));
    expect(new Set(kaplin).size).toBe(5);

    expect(await names("cıvata")).toEqual(["Cıvatalar", "Toksik ve tehlikeli atık temizliği"]);
    // Yazılan biçim hiçbir yerde geçmiyorsa kök yine bulur (ek toleransı).
    expect(await names("rulmanları")).toEqual(["Rulmanlar ve yataklar"]);
    // Kısa kök kullanılmaz: "copies" bakır sınıflarını önermez.
    expect(await names("copies")).toEqual([]);
    expect(await names("fries")).toEqual([]);
  });

  // recategory-new-1 / new-2: öneri de kategori aramasının sırasını kullanır.
  it("öneri sırası: tam ad > adı yazılan kelimeyi taşıyan > adı kökü taşıyan > yalnız eş anlamlı; tavan sıradan SONRA", async () => {
    const cat = (id: string, nameTr: string, level: number, keywords = "", names: { nameEn?: string; nameRu?: string } = {}) => ({
      id,
      code: id,
      nameTr,
      ...names,
      searchText: foldSearchText(`${nameTr} ${keywords} ${names.nameEn ?? ""} ${names.nameRu ?? ""}`),
      level,
      inDiscovery: true,
      sortOrder: Number(id.slice(2, 4)),
    });
    await prisma.category.createMany({
      data: [
        // Altı AİLE yazılan biçimi yalnız eş anlamlısında taşır: düzeye göre
        // ilk beşi almak, adı eşleşen sınıf ve emtiayı hiç önermiyordu.
        ...[10, 11, 12, 13, 14, 15].map((n) => cat(`41${n}0000`, `Test cihazları ${n}`, 2, "hidrolik pompası")),
        cat("40151500", "Pompalar", 3),
        cat("40151501", "Yakıt pompası", 4),
        // "hardware": adı (İngilizce) sorguya eşit aile, adında kelime geçen ailelerden önce.
        cat("30110000", "Bilgisayar donanım bakımı", 2, "", { nameEn: "Computer hardware maintenance" }),
        cat("30120000", "Donanım kiralama", 2, "", { nameEn: "Hardware rental" }),
        cat("31160000", "Hırdavat", 2, "", { nameEn: "Hardware" }),
        cat("31171500", "Rulmanlar ve yataklar", 3),
        cat("26121600", "Elektrik kablosu", 3, "", { nameRu: "Электрические кабели" }),
      ],
    });
    const names = async (q: string) => (await service().suggest(q)).categories.map((c) => c.name);

    const pump = await names("pompası");
    expect(pump).toHaveLength(5);
    expect(pump.slice(0, 2)).toEqual(["Yakıt pompası", "Pompalar"]);
    expect(pump.slice(2)).toEqual(["Test cihazları 10", "Test cihazları 11", "Test cihazları 12"]);

    expect(await names("hardware")).toEqual(["Hırdavat", "Donanım kiralama", "Bilgisayar donanım bakımı"]);
    // Üst üste ek ve Rusça çekim: kategori aramasıyla aynı kök.
    expect(await names("rulmanlarının")).toEqual(["Rulmanlar ve yataklar"]);
    expect(await names("кабель")).toEqual(["Elektrik kablosu"]);
    // Yalnız bağlaçtan oluşan sorgu: süzgeç boş kalıp ilk beş kategori
    // önerilmez; kategori aramasındaki gibi bütün ifade aranır.
    for (const q of ["the", "and the", "для"]) {
      expect({ q, names: await names(q) }).toEqual({ q, names: [] });
    }
    expect(await names("ve")).toEqual(["Rulmanlar ve yataklar"]);
    // Bağlaçlı sorguda bağlaç aranmaz.
    expect(await names("rulmanlar and yataklar")).toEqual(["Rulmanlar ve yataklar"]);
  });

  it("mega menü: L1 + L2, sayı yalnız yayında ürünlerden", async () => {
    // Katalog test DB'sinde boş — menü kaynağı Category tablosudur.
    await prisma.category.createMany({
      data: [
        { id: "39000000", code: "39000000", nameTr: "Elektrik Sistemleri", level: 1 },
        { id: "39120000", code: "39120000", nameTr: "Panolar", level: 2, parentId: "39000000" },
        { id: "31000000", code: "31000000", nameTr: "Üretim Bileşenleri", level: 1 },
      ],
    });
    await seedProduct({}, { categoryId: "39121000" });
    await seedProduct({}, { categoryId: "39121500", isPublic: false, publishedAt: null });
    const menu = await service().categoryMenu();
    const seg = menu.find((m) => m.id === "39000000");
    expect(seg).toBeTruthy();
    // Yayında OLMAYAN ürün sayıya girmez.
    expect(seg?.count).toBe(1);
    const fam = seg?.children.find((c) => c.id === "39120000");
    expect(fam?.count).toBe(1);
    // Ürünü olmayan segment de listelenir (katalog gezilebilir), sayısı 0.
    const other = menu.find((m) => m.id !== "39000000");
    expect(other?.count).toBe(0);
    // Sıra: ürünü olan segment ÖNCE.
    expect(menu[0]?.id).toBe("39000000");
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
    resetEmployeeValueCache();
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

  it("sertifika ve çalışan kovası: süzgeç + BAĞLAMA DUYARLI sayaç", async () => {
    await seedProduct({ city: "İstanbul", certifications: ["ISO 9001", "CE"], employeeCount: "50-249" }, { name: "A" });
    await seedProduct({ city: "İzmir", certifications: ["ISO 9001"], employeeCount: "10-49" }, { name: "B" });
    await seedProduct({ city: "İzmir", certifications: [], employeeCount: "250+" }, { name: "C" });
    resetEmployeeValueCache();

    expect((await service().listProducts({ cert: "ISO 9001" })).items.map((p) => p.name).sort()).toEqual(["A", "B"]);
    // Çoklu = OR.
    expect((await service().listProducts({ cert: "CE,ISO 9001" })).items.map((p) => p.name).sort()).toEqual(["A", "B"]);
    // Kova ALT SINIRIYLA seçilir; serbest metin sunucuda ayrıştırılır.
    expect((await service().listProducts({ employees: "50" })).items.map((p) => p.name)).toEqual(["A"]);
    expect((await service().listProducts({ employees: "10,250" })).items.map((p) => p.name).sort()).toEqual(["B", "C"]);

    const f = await service().productFacets({ cert: "ISO 9001" });
    // Sertifika sayacı KENDİ seçimini hariç tutar → CE hâlâ görünür.
    expect(f.certifications.find((c) => c.cert === "CE")?.count).toBe(1);
    // Şehir sayacı sertifika seçimiyle DARALIR → C (sertifikasız) düşer.
    expect(f.cities.find((c) => c.city === "izmir")?.count).toBe(1);
    // Çalışan sayacı da sertifika seçimiyle daralır.
    expect(f.employees.find((e) => e.key === 250)).toBeUndefined();
  });

  it("fiyat aralığı fiyatsızları düşürür; 'fiyatsızlar dahil' onları geri getirir", async () => {
    await seedProduct({}, { name: "Ucuz", priceMode: "FIXED", priceAmount: "100" });
    await seedProduct({}, { name: "Pahalı", priceMode: "FIXED", priceAmount: "9000" });
    await seedProduct({}, { name: "Teklifle", priceMode: "ON_REQUEST" });
    expect((await service().listProducts({ priceMax: 500 })).items.map((p) => p.name)).toEqual(["Ucuz"]);
    expect(
      (await service().listProducts({ priceMax: 500, priceUnpriced: "1" })).items.map((p) => p.name).sort(),
    ).toEqual(["Teklifle", "Ucuz"]);
  });

  it("KURLA ÇEVİR (2026-09-27): farklı birimdeki fiyatlar ortak tabanda süzülür, sıralanır, histogramlanır", async () => {
    setFxRates({ EUR: 50, JPY: 0.25 });
    try {
      await seedProduct({}, { name: "Avro", priceMode: "FIXED", priceAmount: "450", priceCurrency: "EUR" });
      await seedProduct({}, { name: "Lira", priceMode: "FIXED", priceAmount: "490", priceCurrency: "TRY" });
      await seedProduct({}, { name: "Yen", priceMode: "FIXED", priceAmount: "10000", priceCurrency: "JPY" });
      await seedProduct({}, {
        name: "Kademeli",
        priceMode: "TIERED",
        priceTiers: [{ minQty: 1, unitPrice: 30 }, { minQty: 100, unitPrice: 20 }],
        priceCurrency: "EUR",
      });
      // "En az 400 EUR": 450 EUR girer; 490 TRY (≈9,8 EUR) ve 10.000 JPY
      // (≈50 EUR) girmez — eskiden ham tutar kıyaslanıp ikisi de giriyordu.
      expect(
        (await service().listProducts({ currency: "EUR", priceMin: 400 })).items.map((p) => p.name),
      ).toEqual(["Avro"]);
      // Kademeli ürün kartındaki "…'dan başlayan" fiyatla (20 EUR) süzülür.
      expect(
        (await service().listProducts({ currency: "EUR", priceMin: 15, priceMax: 25 })).items.map((p) => p.name),
      ).toEqual(["Kademeli"]);
      // Sıra TRY karşılığından: 22.500 > 2.500 (JPY) > 1.000 (kademeli) > 490.
      expect((await service().listProducts({ sort: "price_desc" })).items.map((p) => p.name)).toEqual([
        "Avro",
        "Yen",
        "Kademeli",
        "Lira",
      ]);
      const f = await service().productFacets({ currency: "EUR" });
      expect(f.currency).toBe("EUR");
      expect(f.priceHistogram!.max).toBe(450);
      // 490 TRY ≈ 9,8 EUR: alt uç AŞAĞI yuvarlanır (arayüz testi O-016) — ilk
      // çubuğun `priceMin`i en ucuz ürünü de kapsamalı (eskiden 10, 9,8'i dışarıda bırakıyordu).
      expect(f.priceHistogram!.min).toBe(9);
    } finally {
      resetFxRates();
    }
  });

  it("MOQ ön ayar sayaçları KÜMÜLATİF ve where ile aynı kuralı uygular", async () => {
    await seedProduct({}, { name: "A", moq: "5" });
    await seedProduct({}, { name: "B", moq: "50" });
    await seedProduct({}, { name: "C" }); // MOQ yok → her kovaya girer
    const f = await service().productFacets({});
    expect(f.moq["10"]).toBe(2); // A + C
    expect(f.moq["100"]).toBe(3); // A + B + C
    // Sayaç ile liste AYNI sayıyı vermeli — ayrışırsa "≤10 (2)" tıklanıp 1 çıkardı.
    expect((await service().listProducts({ moqMax: 10 })).total).toBe(f.moq["10"]);
    expect((await service().listProducts({ moqMax: 100 })).total).toBe(f.moq["100"]);
  });

  it("fiyat histogramı: fiyatı yazılı 2'den az ürün varsa null", async () => {
    await seedProduct({}, { name: "Tek", priceMode: "FIXED", priceAmount: "100" });
    expect((await service().productFacets({})).priceHistogram).toBeNull();
    for (const p of [200, 300, 400, 500, 600]) {
      await seedProduct({}, { name: `P${p}`, priceMode: "FIXED", priceAmount: String(p) });
    }
    const h = (await service().productFacets({})).priceHistogram;
    expect(h).not.toBeNull();
    expect(h!.min).toBe(100);
    expect(h!.max).toBe(600);
    // Kovalardaki toplam = fiyatı yazılı ürün sayısı (hiçbiri düşmez).
    expect(h!.buckets.reduce((a, b) => a + b.count, 0)).toBe(6);
  });

  it("facet sayıları diğer seçimlere göre; kendi boyutu hariç", async () => {
    await seedProduct({ city: "İstanbul", activities: ["MANUFACTURER"] }, { name: "A" });
    await seedProduct({ city: "İzmir", activities: ["MANUFACTURER"] }, { name: "B" });
    await seedProduct({ city: "İzmir", activities: ["DISTRIBUTOR"] }, { name: "C" });
    const f = await service().productFacets({ activity: "MANUFACTURER" });
    // Şehir sayaçları faaliyet süzgeciyle daralır (C düşer).
    expect([...f.cities].sort((a, b) => a.city.localeCompare(b.city))).toEqual([
      { city: "istanbul", name: "İstanbul", country: "TR", count: 1 },
      { city: "izmir", name: "İzmir", country: "TR", count: 1 },
    ]);
    // Faaliyet sayaçları KENDİ seçimini hariç tutar: DISTRIBUTOR hâlâ görünür.
    expect(f.activities.find((a) => a.activity === "DISTRIBUTOR")?.count).toBe(1);
  });
});

describe("ürün dizini — çok dilli arama (searchTextI18n)", () => {
  beforeEach(async () => {
    await truncateAll();
    resetEmployeeValueCache();
  });

  it("İngilizce/Rusça sorgu çevirisi olan Türkçe ürünü bulur (çoğul toleranslı)", async () => {
    const { product } = await seedProduct({}, { searchTextI18n: "dagitim panosu pano distribution panel распределительныи щит" });
    const ids = async (q: string) => (await service().listProducts({ q })).items.map((p) => p.slug);
    expect(await ids("distribution panels")).toEqual([product.slug]);
    expect(await ids("распределительный щит")).toEqual([product.slug]);
    expect(await ids("switchboard")).toEqual([]);
  });

  it("Türkçe arama değişmedi (searchText yolu)", async () => {
    const { product } = await seedProduct();
    expect((await service().listProducts({ q: "Dağıtım PANOSU" })).items.map((p) => p.slug)).toEqual([product.slug]);
  });
});
