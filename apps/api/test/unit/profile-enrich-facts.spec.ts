import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { BadRequestException } from "@nestjs/common";
import {
  COMPANY_PROFILE_LIMITS,
  COMPANY_SERVICE_MAX_LENGTH,
  COMPANY_SERVICES_MAX,
  hiddenCategoryWhere,
  isHiddenCategory,
} from "@rothern/shared";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import { ProfileDescriptionDto } from "../../src/modules/ai/profile-enrich/profile-enrich.controller";
import {
  PROFILE_DESCRIPTION_MAX_PRODUCTS,
  ProfileEnrichService,
  cleanProfileDescription,
  declaredCategoryAxes,
  hasDescriptionSubstance,
} from "../../src/modules/ai/profile-enrich/profile-enrich.service";
import { UpdateCompanyProfileDto } from "../../src/modules/company-profile/dto/update-company-profile.dto";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";

/**
 * PROFİL TANITIMI ÖNERİSİ — OLGULAR İÇERİ, WEB DIŞARI (sahip kararı 2026-10-08).
 *
 * Model yalnız firmanın platformda KAYITLI verisini görür: ad, hukuki yapı,
 * ülke/şehir, sektör, hizmetler, faaliyet tipi, beyan edilen kategoriler ve
 * vitrindeki ürünler (ad, birkaç etiket; sınırlı sayıda). Site çekilmez, web
 * araması yapılmaz; yanıt YALNIZ tanıtım taslağıdır.
 *
 * Canlı doğrulama 2026-10-09: ürünün PLATFORM KATEGORİSİ gitmez (PD-02 — model
 * boru satan firmanın "Vidalar" etiketini ürün iddiasına çevirdi) ve gizli
 * katalog segmentlerindeki kategori adları gitmez (PD-04).
 */
const CATEGORY_ROWS = [
  { id: "40000000", nameTr: "Dağıtım ve Şartlandırma", nameEn: "Distribution and Conditioning", nameRu: null },
  { id: "40141600", nameTr: "Vanalar", nameEn: "Valves", nameRu: "Клапаны" },
  { id: "40141607", nameTr: "Küresel vanalar", nameEn: "Ball valves", nameRu: null },
  { id: "31000000", nameTr: "İmalat Bileşenleri", nameEn: "Manufacturing Components", nameRu: null },
  { id: "30100000", nameTr: "Yapı bileşenleri", nameEn: "Structural components", nameRu: null },
  // Ürüne iliştirilmiş ama firmanın BEYAN ETMEDİĞİ kategori (PD-02).
  { id: "31161500", nameTr: "Vidalar", nameEn: "Screws", nameRu: "Винты" },
  // GİZLİ segment (10, 2026-09-19'dan beri katalogda sunulmuyor) — PD-04.
  { id: "10000000", nameTr: "Canlı Bitki ve Hayvan Malzemeleri", nameEn: null, nameRu: null },
  { id: "10101500", nameTr: "Çiftlik hayvanları", nameEn: null, nameRu: null },
];

const COMPANY = {
  name: "  Acme   Vana A.Ş. ",
  companyType: "JOINT_STOCK",
  legalFormLocal: null as string | null,
  country: "TR",
  city: "İzmir",
  industry: "Endüstriyel vana" as string | null,
  services: ["Vana bakımı", "Devreye alma"],
  activities: ["MANUFACTURER", "IMPORTER_EXPORTER"],
  // Depoda ata zinciri de durur (L2/L3 + segment); kullanıcının SEÇTİĞİ yaprak
  // `40141607` ve altında seçim olmayan ("sektör geneli") segment `31000000`.
  sellerCategoryIds: ["40000000", "31000000"],
  sellerSubCategoryIds: ["40140000", "40141600", "40141607"],
  buyerCategoryIds: ["30000000"],
  buyerSubCategoryIds: ["30100000"],
};

const PRODUCTS = [
  {
    name: "DN50 küresel vana",
    categoryId: "40141607",
    keywords: ["paslanmaz", "pn16", "flanşlı", "tam geçişli", "beşinci etiket"],
  },
  { name: "Kelebek vana", categoryId: null, keywords: [] },
];

function rig(over: { company?: Partial<typeof COMPANY> | null; products?: typeof PRODUCTS; tier?: string } = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    auditLog: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "att1" }),
    },
    aiUsage: { count: jest.fn().mockResolvedValue(0) },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    company: {
      findUnique: jest
        .fn()
        .mockResolvedValue(over.company === null ? null : { ...COMPANY, ...(over.company ?? {}) }),
    },
    companyItem: { findMany: jest.fn().mockResolvedValue(over.products ?? PRODUCTS) },
    category: {
      findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
        CATEGORY_ROWS.filter((r) => args.where.id.in.includes(r.id)),
      ),
    },
  };
  const ai = {
    isEnabled: true,
    callAi: jest.fn().mockResolvedValue({
      text: JSON.stringify({ aboutText: "Acme Vana olarak İzmir'de endüstriyel vana üretiyoruz." }),
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new ProfileEnrichService(prisma as never, audit as never, ai as never);
  const user = {
    companyId: "c1",
    userId: "u1",
    email: "u1@test.local",
    tier: over.tier ?? "GOLD",
    companyVerificationStatus: "VERIFIED",
  } as unknown as AuthenticatedCompanyUser;
  return { svc, prisma, tx, ai, audit, user };
}

type CallOptions = {
  prompt: string;
  system: string;
  responseSchema: { properties: Record<string, unknown>; required: string[] };
  webSearch?: boolean;
  followUpInputChars?: number;
  thinkingLevel?: string;
};
const optionsOf = (ai: { callAi: jest.Mock }, n = 0) => ai.callAi.mock.calls[n]![1] as CallOptions;
const dataOf = (ai: { callAi: jest.Mock }, n = 0) =>
  JSON.parse(
    optionsOf(ai, n)
      .prompt.replace(/^<firma_verisi>\n/, "")
      .replace(/\n<\/firma_verisi>$/, ""),
  ) as Record<string, unknown>;

describe("ProfileEnrichService — modele giden olgular (firmanın platformdaki kendi kaydı)", () => {
  it("ad, hukuki yapı, ülke/şehir, sektör, hizmetler, faaliyet tipi, beyan edilen kategoriler ve vitrin ürünleri", async () => {
    const r = rig();
    await r.svc.enrich(r.user);
    expect(dataOf(r.ai)).toEqual({
      name: "Acme Vana A.Ş.",
      legalForm: "joint-stock company",
      country: "Türkiye (TR)",
      city: "İzmir",
      sector: "Endüstriyel vana",
      services: ["Vana bakımı", "Devreye alma"],
      activityTypes: ["Üretici", "İthalatçı / İhracatçı"],
      // Yalnız kullanıcının SEÇTİKLERİ: altında seçim olmayan segment + en derin
      // kod; türetilmiş ata zinciri (40140000, 40141600, 40000000) ayrıca sayılmaz.
      sellingCategories: ["İmalat Bileşenleri", "Küresel vanalar"],
      buyingCategories: ["Yapı bileşenleri"],
      showcaseProducts: [
        // Ürün başına en fazla 4 etiket; ürünün platform kategorisi YOK (PD-02).
        { name: "DN50 küresel vana", keywords: ["paslanmaz", "pn16", "flanşlı", "tam geçişli"] },
        { name: "Kelebek vana" },
      ],
    });
  });

  it("ürünün PLATFORM KATEGORİSİ modele gitmez: yalnız ad ve etiketler (PD-02)", async () => {
    // Canlıda: 20 çelik boru ürününün 10'u "Vidalar" kategorisine iliştirilmişti;
    // model "vidalar gibi bağlantı elemanları" diye bir ürün yelpazesi yazdı.
    // Firma vida beyan etmedi, vida satmıyor.
    const r = rig({
      company: { sellerCategoryIds: [], sellerSubCategoryIds: [], buyerCategoryIds: [], buyerSubCategoryIds: [] },
      products: [
        { name: "QA Çelik Boru MUGJWF0Q", categoryId: "31161500", keywords: ["çelik boru", "dikişsiz boru"] },
        { name: "QA Çelik Boru MU4J3RB4", categoryId: "40141607", keywords: [] },
      ],
    });
    await r.svc.enrich(r.user);
    const data = dataOf(r.ai);
    expect(data.showcaseProducts).toEqual([
      { name: "QA Çelik Boru MUGJWF0Q", keywords: ["çelik boru", "dikişsiz boru"] },
      { name: "QA Çelik Boru MU4J3RB4" },
    ]);
    const { prompt, system } = optionsOf(r.ai);
    expect(prompt).not.toMatch(/Vida|Küresel vanalar|category/i);
    // Kategori adı hiç OKUNMAZ (beyan yok → kategori sorgusu da yok) ve ürün
    // satırından kategori kimliği SEÇİLMEZ.
    expect(r.prisma.category.findMany).not.toHaveBeenCalled();
    const select = (r.prisma.companyItem.findMany.mock.calls[0]![0] as { select: Record<string, boolean> }).select;
    expect(select).not.toHaveProperty("categoryId");
    // İstem alan tanımı da ürün kategorisinden söz etmez; kategori ≠ ürün kuralı yazılı.
    expect(system).toContain("showcaseProducts (vitrindeki ürünler: ad, etiketler)");
    expect(system).not.toContain("showcaseProducts içindeki category");
    expect(system).toContain("kategori adından ürün ya da ürün ailesi türetme");
  });

  it("firmanın KENDİ beyan ettiği kategori gitmeye devam eder; ürünün kategorisi onu çoğaltmaz (PD-02)", async () => {
    const r = rig({
      company: {
        sellerCategoryIds: ["40000000"],
        sellerSubCategoryIds: ["40140000", "40141600"],
        buyerCategoryIds: [],
        buyerSubCategoryIds: [],
      },
      products: [{ name: "QA Çelik Boru", categoryId: "31161500", keywords: [] }],
    });
    await r.svc.enrich(r.user);
    expect(dataOf(r.ai).sellingCategories).toEqual(["Vanalar"]);
    const ids = (r.prisma.category.findMany.mock.calls[0]![0] as { where: { id: { in: string[] } } }).where.id.in;
    expect(ids).toEqual(["40141600"]);
    expect(optionsOf(r.ai).prompt).not.toContain("Vida");
  });

  it("yerel hukuki yapı adı varsa o yazılır (GmbH); tür karşılığına düşülmez", async () => {
    const r = rig({ company: { companyType: "OTHER", legalFormLocal: "GmbH", country: "DE", city: "Munich" } });
    await r.svc.enrich(r.user);
    expect(dataOf(r.ai)).toMatchObject({ legalForm: "GmbH", country: "Almanya (DE)", city: "Munich" });
  });

  it("vitrin = YAYINDAKİ ürünler; en yeni yayınlanan üstte ve sayı sınırlı", async () => {
    const r = rig();
    await r.svc.enrich(r.user);
    expect(PROFILE_DESCRIPTION_MAX_PRODUCTS).toBe(20);
    expect(r.prisma.companyItem.findMany).toHaveBeenCalledWith({
      where: { companyId: "c1", isActive: true, isPublic: true },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: PROFILE_DESCRIPTION_MAX_PRODUCTS,
      select: { name: true, keywords: true },
    });
  });

  it("uzun metinler kırpılır: ürün adı ≤120, etiket ≤50, boşluklar tek boşluğa iner", async () => {
    const r = rig({
      products: [{ name: `Vana\n\n${"x".repeat(300)}`, categoryId: null, keywords: [`  ${"k".repeat(80)}  `, "  "] }],
    });
    await r.svc.enrich(r.user);
    const [p] = dataOf(r.ai).showcaseProducts as { name: string; keywords: string[] }[];
    expect(p!.name.length).toBeLessThanOrEqual(120);
    expect(p!.name.startsWith("Vana x")).toBe(true);
    expect(p!.keywords).toEqual(["k".repeat(50)]);
  });

  it("kategori adları İSTEK SAHİBİNİN dilinde gider (çeviri yoksa Türkçeye düşer); istek dili tanıtımın yalnız YEDEK dilidir", async () => {
    const r = rig();
    await runWithLocale("en", () => r.svc.enrich(r.user));
    expect(dataOf(r.ai)).toMatchObject({
      sellingCategories: ["Manufacturing Components", "Ball valves"],
      buyingCategories: ["Structural components"],
    });
    expect(optionsOf(r.ai).system).toContain("şu dili kullan: English (en)");

    await runWithLocale("ru", () => r.svc.enrich(r.user));
    // `nameRu` yok → Türkçe ad; yedek dil yine Rusça.
    expect(dataOf(r.ai, 1)).toMatchObject({ sellingCategories: ["İmalat Bileşenleri", "Küresel vanalar"] });
    expect(optionsOf(r.ai, 1).system).toContain("şu dili kullan: Русский (ru)");
  });

  it("Almanca yazan firma İngilizce arayüzde: tanıtım İngilizceye ZORLANMAZ, firmanın metni olduğu gibi gider", async () => {
    // Arayüz yalnız tr/en/ru sunar; Alman firma EN ile çalışır ama içeriğini
    // Almanca yazar. Eski istem "DAİMA şu dilde yaz: English (en) — girdi başka
    // dilde olsa bile" diyordu → İngilizce tanıtım + Almanca hizmet/sektör =
    // karışık kayıt (içerik çevirisi FAILED ya da çevrilmemiş çipler).
    const r = rig({
      company: {
        name: "Müller Maschinenbau GmbH",
        companyType: "OTHER",
        legalFormLocal: "GmbH",
        country: "DE",
        city: "Stuttgart",
        industry: "Maschinenbau",
        services: ["Schweißkonstruktionen", "CNC-Fräsen"],
      },
      products: [{ name: "Geschweißte Stahlkonstruktion", categoryId: "40141607", keywords: ["Edelstahl"] }],
    });
    await runWithLocale("en", () => r.svc.enrich(r.user));
    const { system } = optionsOf(r.ai);
    expect(system).not.toContain("DAİMA şu dilde yaz");
    expect(system).not.toContain("girdi başka dilde olsa bile");
    expect(system.trimEnd()).toMatch(/ÇIKTI DİLİ \(aboutText\): Girdideki metin .* hangi dilde yazılmışsa O DİLDE yaz — ÇEVİRME\..*$/);
    expect(system).toContain("şu dili kullan: English (en)");
    // Firmanın metni Almanca; yanındaki platform etiketleri başka dilde (beyan
    // edilen kategoriler İngilizce, ülke ve faaliyet tipi Türkçe) → istem bunları
    // dil kararının dışında tutar. Ürün satırı yalnız firmanın yazdıklarını taşır.
    const data = dataOf(r.ai);
    expect(data).toMatchObject({
      sector: "Maschinenbau",
      services: ["Schweißkonstruktionen", "CNC-Fräsen"],
      country: "Almanya (DE)",
      sellingCategories: ["Manufacturing Components", "Ball valves"],
    });
    expect(data.showcaseProducts).toEqual([{ name: "Geschweißte Stahlkonstruktion", keywords: ["Edelstahl"] }]);
    expect(system).toContain("çıktı dilini YALNIZ bunlardan belirle");
    expect(system).toContain("PLATFORM ETİKETİDİR");
  });

  it("ürünü olmayan firma: diğer verilerden yine yazar, yanıt productCount=0 der", async () => {
    const r = rig({ products: [] });
    const draft = await r.svc.enrich(r.user);
    expect(draft.productCount).toBe(0);
    expect(dataOf(r.ai)).not.toHaveProperty("showcaseProducts");
    expect(dataOf(r.ai)).toMatchObject({ sector: "Endüstriyel vana", services: ["Vana bakımı", "Devreye alma"] });
  });

  it("kaydedilmemiş form değerleri (sektör, hizmetler) kayıtlının YERİNE okunur ve DTO tavanlarına kırpılır", async () => {
    const r = rig();
    await r.svc.enrich(r.user, {
      industry: "  Vana   ve aktüatör ",
      services: ["  Saha montajı ", "", "y".repeat(200)],
    });
    const data = dataOf(r.ai);
    expect(data.sector).toBe("Vana ve aktüatör");
    expect(data.services).toEqual(["Saha montajı", "y".repeat(COMPANY_SERVICE_MAX_LENGTH)]);

    // Boş gönderilen sektör = kullanıcı alanı temizledi → kayıtlı değere DÖNÜLMEZ.
    await r.svc.enrich(r.user, { industry: "", services: [] });
    expect(dataOf(r.ai, 1)).not.toHaveProperty("sector");
    expect(dataOf(r.ai, 1)).not.toHaveProperty("services");
  });

  it("yalnız ad + konum 'olgu' sayılmaz; tek bir sektör / hizmet / kategori / ürün yeter", () => {
    const bos = {
      name: "Acme",
      legalForm: "limited liability company",
      country: "Türkiye (TR)",
      city: "İzmir",
      sector: null,
      services: [],
      activityTypes: [],
      categories: [],
      sellingCategories: [],
      buyingCategories: [],
      showcaseProducts: [],
    };
    expect(hasDescriptionSubstance(bos)).toBe(false);
    expect(hasDescriptionSubstance({ ...bos, sector: "Vana" })).toBe(true);
    expect(hasDescriptionSubstance({ ...bos, buyingCategories: ["Vanalar"] })).toBe(true);
    // Yönsüz beyan da olgudur (kayıttan çıkan firmanın tek verisi bu olabilir).
    expect(hasDescriptionSubstance({ ...bos, categories: ["Vanalar"] })).toBe(true);
    expect(hasDescriptionSubstance({ ...bos, showcaseProducts: [{ name: "x", keywords: [] }] })).toBe(true);
  });
});

describe("ProfileEnrichService — kategori yönü: kayıt tek soru sorar, yön uydurulmaz", () => {
  /**
   * Kayıt (`completeOnboarding`) seçimi DÖRT kolona yazar: mainIds → satış +
   * satın alma ana, subIds → iki alt. Firma Ayarlar'da ayırmadıysa iki liste
   * aynıdır ve en az biri olgu DEĞİLDİR; "sattığı / satın aldığı" diye giderse
   * vana üreticisinin tanıtımı "vana satın alıyoruz", müteahhidinki "çimento
   * satıyoruz" diyebilir.
   */
  const KAYITTAN_CIKAN = {
    sellerCategoryIds: ["40000000"],
    sellerSubCategoryIds: ["40140000", "40141600"],
    buyerCategoryIds: ["40000000"],
    buyerSubCategoryIds: ["40140000", "40141600"],
  };

  it("satış ve satın alma seçimleri AYNI küme → tek yönsüz `categories`; yönlü alanlar GİTMEZ", async () => {
    const r = rig({ company: KAYITTAN_CIKAN, products: [] });
    await r.svc.enrich(r.user);
    const data = dataOf(r.ai);
    expect(data.categories).toEqual(["Vanalar"]);
    expect(data).not.toHaveProperty("sellingCategories");
    expect(data).not.toHaveProperty("buyingCategories");
    // Aynı kategori adı isteme BİR kez girer ("sattığı" + "satın aldığı" diye iki kez değil).
    expect(optionsOf(r.ai).prompt.match(/Vanalar/g)).toHaveLength(1);
    expect(optionsOf(r.ai).system).toContain("alış / satış ayrımı YAPILMAMIŞ");
  });

  it("küme karşılaştırması sıradan ve türetilmiş ata zincirinden bağımsız", async () => {
    const r = rig({
      company: {
        sellerCategoryIds: ["31000000", "40000000"],
        sellerSubCategoryIds: ["40141607", "40141600", "40140000"],
        // Aynı seçimler; kolon sırası farklı, ata zinciri eksik yazılmış.
        buyerCategoryIds: ["40000000", "31000000"],
        buyerSubCategoryIds: ["40141607"],
      },
      products: [],
    });
    await r.svc.enrich(r.user);
    const data = dataOf(r.ai);
    expect(data.categories).toEqual(["İmalat Bileşenleri", "Küresel vanalar"]);
    expect(data).not.toHaveProperty("sellingCategories");
    expect(data).not.toHaveProperty("buyingCategories");
  });

  it("firma alışı satıştan AYIRDIYSA (kümeler farklı) yön olgudur: iki yönlü liste gider, `categories` gitmez", async () => {
    // Kısmen örtüşen kümeler de "ayrılmış" sayılır (satış ⊋ satın alma).
    const r = rig({
      company: {
        sellerCategoryIds: ["40000000", "31000000"],
        sellerSubCategoryIds: ["40140000", "40141600"],
        buyerCategoryIds: ["31000000"],
        buyerSubCategoryIds: [],
      },
      products: [],
    });
    await r.svc.enrich(r.user);
    const data = dataOf(r.ai);
    expect(data).not.toHaveProperty("categories");
    expect(data.sellingCategories).toEqual(["İmalat Bileşenleri", "Vanalar"]);
    expect(data.buyingCategories).toEqual(["İmalat Bileşenleri"]);
  });

  it("yalnız tek eksen doluysa (satın alma boş) yönlü kalır; iki eksen de boşsa hiçbir kategori alanı gitmez", async () => {
    const satici = rig({
      company: { sellerCategoryIds: ["31000000"], sellerSubCategoryIds: [], buyerCategoryIds: [], buyerSubCategoryIds: [] },
      products: [],
    });
    await satici.svc.enrich(satici.user);
    expect(dataOf(satici.ai)).toMatchObject({ sellingCategories: ["İmalat Bileşenleri"] });
    expect(dataOf(satici.ai)).not.toHaveProperty("categories");
    expect(dataOf(satici.ai)).not.toHaveProperty("buyingCategories");

    const bos = rig({
      company: { sellerCategoryIds: [], sellerSubCategoryIds: [], buyerCategoryIds: [], buyerSubCategoryIds: [] },
      products: [],
    });
    await bos.svc.enrich(bos.user);
    for (const alan of ["categories", "sellingCategories", "buyingCategories"]) {
      expect(dataOf(bos.ai)).not.toHaveProperty(alan);
    }
  });

  it("declaredCategoryAxes: isteme giren tavan (12) karşılaştırmadan SONRA uygulanır", () => {
    // 13 seçim: ilk 12'si aynı, 13.'sü farklı → kümeler FARKLI (tavan önce
    // uygulansaydı ikisi de aynı 12'ye kırpılıp yönsüz sayılırdı).
    const ortak = Array.from({ length: 12 }, (_, i) => `${20 + i}000000`);
    const farkli = declaredCategoryAxes({
      sellerCategoryIds: [...ortak, "95000000"],
      sellerSubCategoryIds: [],
      buyerCategoryIds: [...ortak, "81000000"],
      buyerSubCategoryIds: [],
    });
    expect(farkli.neutral).toEqual([]);
    expect(farkli.selling).toHaveLength(12);
    expect(farkli.buying).toHaveLength(12);

    const ayni = declaredCategoryAxes({
      sellerCategoryIds: [...ortak, "95000000"],
      sellerSubCategoryIds: null,
      buyerCategoryIds: ["95000000", ...ortak],
      buyerSubCategoryIds: undefined,
    });
    expect(ayni).toEqual({ neutral: ortak, selling: [], buying: [] });
  });
});

describe("ProfileEnrichService — gizli katalog segmentleri modele gitmez (PD-04)", () => {
  /**
   * Gizli segmentler katalogdan kaldırıldı (`HIDDEN_SEGMENTS`, ilk tur 2026-09-19); eski
   * beyanlar ve ürün kategorileri satırda duruyor. Kataloğun artık sunmadığı bir
   * kategori adı ("Çiftlik hayvanları") modele firma olgusu diye verilmez.
   */
  const GIZLI = { segment: "10000000", yaprak: "10101500" };

  it("fikstür sağlaması: 10 gizli, 40 görünür segment", () => {
    expect(isHiddenCategory(GIZLI.segment)).toBe(true);
    expect(isHiddenCategory(GIZLI.yaprak)).toBe(true);
    expect(isHiddenCategory("40141600")).toBe(false);
  });

  it("beyan edilen gizli segment kodları süzülür: adı okunmaz, isteme girmez", async () => {
    const r = rig({
      company: {
        sellerCategoryIds: [GIZLI.segment, "40000000"],
        sellerSubCategoryIds: ["10100000", GIZLI.yaprak, "40140000", "40141600"],
        buyerCategoryIds: [GIZLI.segment],
        buyerSubCategoryIds: [],
      },
      products: [],
    });
    await r.svc.enrich(r.user);
    const data = dataOf(r.ai);
    expect(data.sellingCategories).toEqual(["Vanalar"]);
    // Satın alma ekseninde yalnız gizli segment vardı → alan hiç gitmez.
    expect(data).not.toHaveProperty("buyingCategories");
    expect(optionsOf(r.ai).prompt).not.toMatch(/Çiftlik|Canlı Bitki/);
    const where = (r.prisma.category.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where.id).toEqual({ in: ["40141600"] });
    // İkinci hat: sorgu da gizli segmenti dışlar (tek kaynak `hiddenCategoryWhere`).
    expect(where.NOT).toEqual(hiddenCategoryWhere().NOT);
  });

  it("gizli kod yön karşılaştırmasına da girmez: geriye kalan seçimler aynıysa beyan YÖNSÜZDÜR", async () => {
    const r = rig({
      company: {
        sellerCategoryIds: ["40000000", GIZLI.segment],
        sellerSubCategoryIds: ["40140000", "40141600", "10100000", GIZLI.yaprak],
        buyerCategoryIds: ["40000000"],
        buyerSubCategoryIds: ["40140000", "40141600"],
      },
      products: [],
    });
    await r.svc.enrich(r.user);
    const data = dataOf(r.ai);
    expect(data.categories).toEqual(["Vanalar"]);
    expect(data).not.toHaveProperty("sellingCategories");
    expect(data).not.toHaveProperty("buyingCategories");
  });

  it("declaredCategoryAxes: gizli yaprak görünür segmenti 'kapsanmış' saydırmaz, gizli segment düşer", () => {
    expect(
      declaredCategoryAxes({
        sellerCategoryIds: [GIZLI.segment, "31000000"],
        sellerSubCategoryIds: [GIZLI.yaprak],
        buyerCategoryIds: [],
        buyerSubCategoryIds: [],
      }),
    ).toEqual({ neutral: [], selling: ["31000000"], buying: [] });
    // Yalnız gizli beyan → hiçbir eksen dolmaz.
    expect(
      declaredCategoryAxes({
        sellerCategoryIds: [GIZLI.segment],
        sellerSubCategoryIds: [GIZLI.yaprak],
        buyerCategoryIds: [GIZLI.segment],
        buyerSubCategoryIds: [GIZLI.yaprak],
      }),
    ).toEqual({ neutral: [], selling: [], buying: [] });
  });

  it("tek verisi gizli segment beyanı olan firma: yazacak olgu yok → AI çağrılmaz, hak yanmaz", async () => {
    const r = rig({
      company: {
        industry: null,
        services: [],
        activities: [],
        sellerCategoryIds: [GIZLI.segment],
        sellerSubCategoryIds: [GIZLI.yaprak],
        buyerCategoryIds: [GIZLI.segment],
        buyerSubCategoryIds: [GIZLI.yaprak],
      },
      products: [],
    });
    await expect(r.svc.enrich(r.user)).rejects.toThrow(BadRequestException);
    expect(r.ai.callAi).not.toHaveBeenCalled();
    expect(r.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("gizli kategoriye iliştirilmiş ÜRÜN yine yazılır (adı ve etiketi olgudur); kategorisi hiç okunmaz", async () => {
    const r = rig({
      company: { sellerCategoryIds: [], sellerSubCategoryIds: [], buyerCategoryIds: [], buyerSubCategoryIds: [] },
      products: [{ name: "QA Çelik Boru", categoryId: GIZLI.yaprak, keywords: ["dikişsiz boru"] }],
    });
    const draft = await r.svc.enrich(r.user);
    expect(draft.productCount).toBe(1);
    expect(dataOf(r.ai).showcaseProducts).toEqual([{ name: "QA Çelik Boru", keywords: ["dikişsiz boru"] }]);
    expect(optionsOf(r.ai).prompt).not.toContain("Çiftlik");
    expect(r.prisma.category.findMany).not.toHaveBeenCalled();
  });
});

describe("ProfileEnrichService — web erişimi YOK", () => {
  it("tek AI çağrısı: web araması, bağlı ikinci çağrı ve dış HTTP isteği yok", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("web erişimi olmamalı"));
    try {
      // Web sitesi kayıtlı olsa da okunmaz — servis o kolonu SEÇMEZ.
      const r = rig();
      await r.svc.enrich(r.user);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(r.ai.callAi).toHaveBeenCalledTimes(1);
      const options = optionsOf(r.ai);
      expect(options.webSearch).toBeUndefined();
      expect(options.followUpInputChars).toBeUndefined();
      expect(options.thinkingLevel).toBe("low");
      const select = (r.prisma.company.findUnique.mock.calls[0]![0] as { select: Record<string, boolean> }).select;
      expect(select).not.toHaveProperty("website");
      expect(select).not.toHaveProperty("aboutText");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("şema ve yanıt YALNIZ tanıtım metni: hizmet, şehir, yıl, sosyal bağlantı, logo alanı yok", async () => {
    const r = rig();
    // Model fazladan alan döndürse de yanıta TAŞINMAZ.
    r.ai.callAi.mockResolvedValue({
      text: JSON.stringify({
        aboutText: "Acme Vana olarak endüstriyel vana üretiyoruz.",
        services: ["Uydurma hizmet"],
        foundedYear: 1998,
        linkedinUrl: "https://linkedin.com/company/x",
      }),
    });
    const draft = await r.svc.enrich(r.user);
    expect(Object.keys(optionsOf(r.ai).responseSchema.properties)).toEqual(["aboutText"]);
    expect(Object.keys(draft).sort()).toEqual(["aboutText", "productCount", "remainingSuggestions"]);
    expect(draft).toEqual({
      aboutText: "Acme Vana olarak endüstriyel vana üretiyoruz.",
      productCount: 2,
      remainingSuggestions: null,
    });
  });

  it("taslak KAYDEDİLMEZ: firma kaydına yazım yok (kullanıcı kutuda düzenleyip kendi kaydeder)", async () => {
    const r = rig();
    await r.svc.enrich(r.user);
    expect(r.prisma.company).not.toHaveProperty("update");
    expect(Object.keys(r.prisma.company)).toEqual(["findUnique"]);
  });
});

describe("cleanProfileDescription — model çıktısı → kutuya yazılacak taslak", () => {
  it("tek paragraf: madde işareti, emoji ve satır sonları temizlenir", () => {
    expect(cleanProfileDescription("- Vana üretiyoruz. 🚀\n\n* İzmir'deyiz.")).toBe("Vana üretiyoruz. İzmir'deyiz.");
  });

  it("uzun metin cümle sınırında kesilir (yarım cümle kalmaz) ve profil tavanının altındadır", () => {
    const out = cleanProfileDescription(
      Array.from({ length: 60 }, (_, i) => `Cümle numarası ${i} burada biter.`).join(" "),
    );
    expect(out.length).toBeLessThanOrEqual(900);
    expect(out.length).toBeLessThanOrEqual(COMPANY_PROFILE_LIMITS.aboutText);
    expect(out.length).toBeGreaterThan(450);
    expect(out.endsWith("burada biter.")).toBe(true);
  });

  it("metin değilse boş döner (çağıran 'yazılamadı' der, hak yanmaz)", () => {
    expect(cleanProfileDescription(null)).toBe("");
    expect(cleanProfileDescription(42)).toBe("");
    expect(cleanProfileDescription("   ")).toBe("");
  });
});

describe("ProfileDescriptionDto — uç gövdesi", () => {
  const errorsOf = (body: object) =>
    validateSync(plainToInstance(ProfileDescriptionDto, body) as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it("boş gövde ve taslak sektör/hizmetler geçer", () => {
    expect(errorsOf({})).toEqual([]);
    expect(errorsOf({ industry: "Vana", services: ["Montaj"] })).toEqual([]);
  });

  it("web sitesi adresi ARTIK kabul edilmez (eski istemci 400 alır, AI çağrılmaz)", () => {
    expect(errorsOf({ website: "ornekfirma.com" }).map((e) => e.property)).toEqual(["website"]);
  });

  it("tavanlar profil DTO'suyla AYNI sabitlerden: sektör uzunluğu, hizmet uzunluğu ve adedi", () => {
    expect(errorsOf({ industry: "x".repeat(COMPANY_PROFILE_LIMITS.industry + 1) }).map((e) => e.property)).toEqual(["industry"]);
    expect(errorsOf({ services: ["x".repeat(COMPANY_SERVICE_MAX_LENGTH + 1)] }).map((e) => e.property)).toEqual(["services"]);
    expect(
      errorsOf({ services: Array.from({ length: COMPANY_SERVICES_MAX + 1 }, (_, i) => `h${i}`) }).map((e) => e.property),
    ).toEqual(["services"]);
    // Profil kaydı da aynı tavanda reddeder (derin denetim S069: iki taraf ayrışmasın).
    const profil = validateSync(
      plainToInstance(UpdateCompanyProfileDto, { services: ["x".repeat(COMPANY_SERVICE_MAX_LENGTH + 1)] }) as object,
    );
    expect(profil.some((e) => e.property === "services")).toBe(true);
  });
});
