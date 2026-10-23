/**
 * GİZLİ DAL — e-posta ve yapay zekâ yüzeyleri (2026-10-09).
 *
 * Kullanıcı kuralı: "anasayfada olmayan kategori talepte, üründe ya da başka
 * yerde de gösterilmesin". Anasayfa görünür segmentlerin TAMAMINI çizer, yani
 * gizli bir önekin (`HIDDEN_CATEGORY_PREFIXES`) altındaki kategori hiç kimseye,
 * hiçbir biçimde gösterilmez: e-posta alıcısına, kayıtsız önizleme sayfasına,
 * modele giden isteme, keşif penceresinin rozetine. ESKİ kayıtlar (dal
 * gizlenmeden önce açılmış talep, o dalı beyan etmiş firma) durur; yalnız gizli
 * kategorileri okumalardan düşer.
 *
 * EŞLEŞTİRME DEĞİŞMEZ: kim bulunur / kim davet edilir, saklanan kodların
 * tamamıyla hesaplanır — yalnız GÖSTERİM ve modele yazılan AD süzülür.
 *
 * 2026-10-10 (sahip kararı): gizlemenin birimi KOD ÖNEKİ. 46 "İş Güvenliği ve
 * Yangın Ekipmanları" adıyla GÖRÜNÜR; altında 4610 ailesi (silah) ve 4618
 * ailesinin 461825 sınıfı gizli. Örnek kodlar:
 *   46101500 — gizli AİLE altında (dosyanın "eski kayıt" kodu),
 *   46182501 — görünür ailenin gizli SINIFI altında,
 *   10xxxxxx — tümüyle gizli SEGMENT,
 *   46181700 / 46180000 / 46000000 — 46'nın GÖRÜNÜR kodları (sıradan kategori),
 *   31xxxxxx — görünür segment.
 */
import { Prisma } from "@rothern/db";
import { foldSearchText, isHiddenCategory } from "@rothern/shared";
import { SupplierDiscoveryService, type DiscoveryAiRunner } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { DiscoveryRunsService } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import { SeoEnrichService } from "../../src/modules/ai/seo-enrich/seo-enrich.service";
import { CategorySuggestService } from "../../src/modules/ai/tender-extract/category-suggest.service";
import { resolveCategoryHints } from "../../src/modules/ai/category-hint-resolver";
import { CategoryTranslationService } from "../../src/modules/content-translation/category-translation.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { ExternalInviteDispatcher } from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const DAY = 24 * 3_600_000;

/**
 * [kod, seviye, TR, EN, RU] — 46: görünür segment + gizli aile (4610) + görünür
 * aile (4618) ve onun gizli sınıfı (461825); 10: gizli segment; 31: görünür dal.
 */
const CATALOG: Array<[string, number, string, string, string]> = [
  ["46000000", 1, "İş Güvenliği ve Yangın Ekipmanları", "Workplace Safety and Fire Equipment", "Средства охраны труда и противопожарное оборудование"],
  ["46100000", 2, "Hafif silahlar ve mühimmat", "Light weapons and ammunition", "Стрелковое оружие и боеприпасы"],
  ["46101500", 3, "Ateşli silahlar", "Firearms", "Огнестрельное оружие"],
  ["46180000", 2, "Kişisel güvenlik ve koruma", "Personal safety and protection", "Личная безопасность и защита"],
  ["46181700", 3, "Baş koruma", "Head protection", "Защита головы"],
  ["46182500", 3, "Kişisel savunma cihazları", "Personal defense devices", "Средства самообороны"],
  ["46182501", 4, "Biber gazı spreyleri", "Pepper sprays", "Перцовые баллончики"],
  ["10000000", 1, "Canlı bitki ve hayvanlar", "Live plant and animal material", "Живые растения и животные"],
  ["10100000", 2, "Canlı hayvanlar", "Live animals", "Живые животные"],
  ["10101500", 3, "Çiftlik hayvanları", "Livestock", "Домашний скот"],
  ["31000000", 1, "İmalat bileşenleri", "Manufacturing components", "Производственные компоненты"],
  ["31160000", 2, "Bağlantı elemanları", "Hardware", "Крепёж"],
  ["31161500", 3, "Vidalar", "Screws", "Винты"],
];
/** Tek kaynak `isHiddenCategory`: fikstür listesi kuralla birlikte değişir. */
const HIDDEN_NAMES = CATALOG.filter(([code]) => isHiddenCategory(code)).flatMap(([, , tr, en, ru]) => [tr, en, ru]);
const HIDDEN_CODES = CATALOG.map(([code]) => code).filter((c) => isHiddenCategory(c));

async function seedCatalog() {
  await prisma.category.createMany({
    data: CATALOG.map(([id, level, nameTr, nameEn, nameRu]) => ({
      id,
      code: id,
      level,
      nameTr,
      nameEn,
      nameRu,
      isActive: true,
      sortOrder: 0,
    })),
  });
}

/** Metinde gizli dallardan hiçbir ad ve kod geçmiyor. */
function expectNoHiddenCategory(text: string) {
  for (const name of HIDDEN_NAMES) expect(text).not.toContain(name);
  for (const code of HIDDEN_CODES) expect(text).not.toContain(code);
}

async function settle(check: () => Promise<boolean> | boolean, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("settle: condition not reached");
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeAll(() => {
  // Fikstür kodları gerçekten bekleneni söylüyor mu (kural değişirse bu dosya sessizce boş sınamasın).
  expect(HIDDEN_CODES.sort()).toEqual(["10000000", "10100000", "10101500", "46100000", "46101500", "46182500", "46182501"]);
});
beforeEach(async () => {
  await truncateAll();
  await seedCatalog();
});

/* ------------------------------------------------------------------ */
/* Dış talep daveti: e-posta + hatırlatma içeriği + kayıtsız önizleme */
/* ------------------------------------------------------------------ */

type SendArg = {
  to: { email: string };
  locale: string;
  templateData: { template: string; data: Record<string, unknown> };
  context: { type: string; id: string };
};

function makeEmail() {
  return {
    send: jest.fn(async (a: SendArg) => {
      await prisma.emailLog.create({
        data: {
          template: a.templateData.template,
          toEmail: a.to.email,
          subject: "s",
          provider: "test",
          status: "SENT",
          contextType: a.context.type,
          contextId: a.context.id,
        },
      });
      return { emailLogId: "t", sent: true };
    }),
  };
}
const makeConfig = () => ({ get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) });

function makeConnections() {
  return new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    makeEmail() as never,
    makeConfig() as never,
    { notify: jest.fn().mockResolvedValue(1), pushToCompany: jest.fn().mockResolvedValue(1), pushToUser: jest.fn().mockResolvedValue(1) } as never,
    new AuditService(prisma as never),
  );
}

async function legacyListing(companyId: string, userId: string, categoryIds: string[], extra: Partial<Prisma.ListingUncheckedCreateInput> = {}) {
  const listing = await makeListing(prisma, {
    companyId,
    createdById: userId,
    type: "ALIM",
    status: "OPEN",
    title: "Baret alımı",
    closesAt: new Date(Date.now() + 10 * DAY),
    categoryIds,
    ...extra,
  });
  await makeItem(prisma, listing.id, { name: "Baret", quantity: new Prisma.Decimal(100), unit: "adet", unitCode: "PCE" });
  return listing;
}

describe("dış talep daveti — gizli daldaki kategori e-postaya ve önizleme sayfasına yazılmaz", () => {
  it("eski talep (gizli aile + gizli segment + 31): e-posta ve önizleme yalnız görünür kategoriyi taşır; talep yine davet edilir", async () => {
    const service = makeConnections();
    const email = makeEmail();
    const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, makeConfig() as never, undefined as never);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46101500", "10101500", "31161500"]);

    await service.inviteExternalForListing(owner.auth, listing.id, ["dis@firma.com"]);
    await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - 60_000) } });
    const r = await dispatcher.dispatch();
    expect(r.sent).toBe(1);

    const sent = email.send.mock.calls.at(-1)![0] as SendArg;
    expect(sent.templateData.template).toBe("tender_external_invite");
    const categories = sent.templateData.data.categories as string[];
    expect(categories).toHaveLength(1);
    expect(["Vidalar", "Screws", "Винты"]).toContain(categories[0]);
    expectNoHiddenCategory(JSON.stringify(sent.templateData.data));
    // Talebin kendisi aynen gitti (kategori dışındaki içerik değişmedi).
    expect(sent.templateData.data).toMatchObject({ itemCount: 1, items: [{ name: "Baret", quantity: 100 }] });

    // Kayıtsız önizleme sayfası aynı içeriği okur — üç dilde de.
    const token = (await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "dis@firma.com" } })).token;
    for (const [locale, name] of [["tr", "Vidalar"], ["en", "Screws"], ["ru", "Винты"]] as const) {
      const preview = await runWithLocale(locale, () => service.invitePreview(token));
      expect(preview.categories).toEqual([name]);
      expect(preview.listingId).toBe(listing.id);
      expectNoHiddenCategory(JSON.stringify(preview));
    }
  });

  it("yalnız gizli kategorili eski talep: kategori satırı boş gider, davet yine gönderilir", async () => {
    const service = makeConnections();
    const email = makeEmail();
    const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, makeConfig() as never, undefined as never);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46101500"]);

    await service.inviteExternalForListing(owner.auth, listing.id, ["dis@firma.com"]);
    await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - 60_000) } });
    expect((await dispatcher.dispatch()).sent).toBe(1);
    const data = (email.send.mock.calls.at(-1)![0] as SendArg).templateData.data;
    expect(data.categories).toEqual([]);
    expectNoHiddenCategory(JSON.stringify(data));

    const token = (await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "dis@firma.com" } })).token;
    const preview = await service.invitePreview(token);
    expect(preview.categories).toEqual([]);
    expect(preview.tenderTitle).toBe("Baret alımı");
  });
});

/* ------------------------------------------------------------------ */
/* AI tedarikçi keşfi                                                  */
/* ------------------------------------------------------------------ */

/** Model çağrılarını kaydeden yürütücü: araştırma metni + boş firma listesi. */
function recordingRunner() {
  const calls: Array<{ stage: string; prompt: string; system: string }> = [];
  const runner: DiscoveryAiRunner = async (opts) => {
    calls.push({ stage: opts.stage, prompt: opts.prompt, system: opts.system });
    return { text: opts.stage === "research" ? "research" : JSON.stringify({ companies: [] }), costUsd: 0 };
  };
  return { runner, calls };
}

describe("AI tedarikçi keşfi — web araştırması istemi", () => {
  const discovery = () => new SupplierDiscoveryService(prisma as never, {} as never, prisma as never);
  const base = { buyerCountry: "TR", targetCountries: ["TR"], locale: "tr" as const };

  it("eski talebin gizli kategorisi isteme yazılmaz; görünür kategori İngilizce adıyla yazılır", async () => {
    const { runner, calls } = recordingRunner();
    await discovery().searchWeb({ ...base, categoryIds: ["46101500", "10101500", "31161500"], itemNames: ["Baret"] }, runner);
    const research = calls.find((c) => c.stage === "research")!;
    expect(research.prompt).toContain("Kategoriler: Screws");
    expect(research.prompt).toContain("1. Baret");
    for (const c of calls) expectNoHiddenCategory(`${c.system}\n${c.prompt}`);
  });

  it("yalnız gizli kategori: kategori satırı yok, arama kalem adlarıyla sürer; kalem de yoksa model hiç çağrılmaz", async () => {
    const withItems = recordingRunner();
    await discovery().searchWeb({ ...base, categoryIds: ["46101500"], itemNames: ["Baret"] }, withItems.runner);
    const research = withItems.calls.find((c) => c.stage === "research")!;
    expect(research.prompt).not.toContain("Kategoriler:");
    expect(research.prompt).toContain("1. Baret");
    expectNoHiddenCategory(research.prompt);

    const bare = recordingRunner();
    const out = await discovery().searchWeb({ ...base, categoryIds: ["46101500"], itemNames: [] }, bare.runner);
    expect(out.companies).toEqual([]);
    expect(bare.calls).toHaveLength(0);
  });

  it("gizli kod on kategori tavanında görünür kategorinin yerini kapmaz", async () => {
    const hidden = Array.from({ length: 10 }, (_, i) => `4610${1000 + i}`);
    const { runner, calls } = recordingRunner();
    await discovery().searchWeb({ ...base, categoryIds: [...hidden, "31161500"], itemNames: [] }, runner);
    expect(calls.find((c) => c.stage === "research")!.prompt).toContain("Kategoriler: Screws");
  });
});

describe("AI tedarikçi keşfi — platform üyesinin eşleşme rozeti (matchedCategories)", () => {
  const discovery = () => new SupplierDiscoveryService(prisma as never, {} as never, prisma as never);

  async function seller(name: string, data: { sellerCategoryIds: string[]; sellerSubCategoryIds: string[] }) {
    const s = await makeCompanyWithUser(prisma, { name, tier: "SILVER" });
    await prisma.company.update({ where: { id: s.company.id }, data });
    return s;
  }

  it("gizli daldaki eşleşme SAYILIR (firma bulunur, güçlü eşleşme) ama adlandırılmaz — görünür atası (46) da rozet olmaz", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await seller("Emniyet Ekipman AŞ", { sellerCategoryIds: ["46000000"], sellerSubCategoryIds: ["46100000", "46101500"] });

    for (const locale of ["tr", "en", "ru"] as const) {
      const res = await discovery().discoverRegisteredFor(buyer.company.id, { categoryIds: ["46101500"], locale });
      expect(res.candidates.map((c) => c.name)).toEqual(["Emniyet Ekipman AŞ"]);
      expect(res.candidates[0]!.strongMatch).toBe(true);
      expect(res.candidates[0]!.matchedCategories).toEqual([]);
      expectNoHiddenCategory(JSON.stringify(res));
    }
  });

  it("karışık talep (gizli aile + 31): rozet yalnız görünür kategorileri taşır; gizli kod üç rozet tavanında yer kapmaz", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    // Beyan sırası gizli kodlarla başlıyor: eski kırpma (ilk 3) görünür adları düşürürdü.
    await seller("Karma Tedarik AŞ", {
      sellerCategoryIds: ["46000000", "31000000"],
      sellerSubCategoryIds: ["46100000", "46101500", "31160000", "31161500"],
    });

    const res = await discovery().discoverRegisteredFor(buyer.company.id, {
      categoryIds: ["46101500", "31161500"],
      locale: "en",
    });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]!.matchedCategories).toEqual(["Hardware", "Screws", "Manufacturing components"]);
    expectNoHiddenCategory(JSON.stringify(res));
  });
});

/**
 * KAYITLI TALEPTEN ELLE AÇILIŞ (gözden geçirme R1). Talep sayfasındaki "AI ile
 * tedarikçi bul" penceresi talep detayının kodlarını yollar; sahip detayı artık
 * yalnız GÖRÜNÜR kodları döndürdüğü için istemcinin listesi gizli kodu taşımaz.
 * Eşleştirme istemcinin listesiyle yapılsaydı eski talep kimseyle eşleşmezdi
 * (karışık talepte gizli yarı sessizce düşerdi) ve otomatik turdan ayrışırdı.
 * `listingId` çağıranın talebine çözülüyorsa ve talepte kayıtlı kod varsa
 * kodlar TALEPTEN okunur (`savedRequestCategoryIds`).
 */
describe("AI tedarikçi keşfi — kayıtlı talepten elle açılış: eşleştirme saklanan kodlarla", () => {
  const discovery = (ai: unknown = {}) => new SupplierDiscoveryService(prisma as never, ai as never, prisma as never);

  async function seller(name: string, data: { sellerCategoryIds: string[]; sellerSubCategoryIds: string[] }) {
    const s = await makeCompanyWithUser(prisma, { name, tier: "SILVER" });
    await prisma.company.update({ where: { id: s.company.id }, data });
    return s;
  }
  const hiddenSeller = () =>
    seller("Emniyet Ekipman AŞ", { sellerCategoryIds: ["46000000"], sellerSubCategoryIds: ["46100000", "46101500"] });
  const visibleSeller = () =>
    seller("Vida Sanayi AŞ", { sellerCategoryIds: ["31000000"], sellerSubCategoryIds: ["31160000", "31161500"] });

  /** Pencerenin yolladığı gövde: talep detayının (sahip dalı) kodları + kalem adları. */
  async function windowBody(owner: Awaited<ReturnType<typeof makeCompanyWithUser>>, listingId: string) {
    const detail = (await makeService().service.getOne(owner.auth, listingId)) as unknown as {
      categoryIds: string[];
      items: Array<{ name: string }>;
    };
    return {
      type: "ALIM" as const,
      listingId,
      categoryIds: detail.categoryIds,
      itemNames: detail.items.map((i) => i.name),
    };
  }

  it("yalnız gizli kategorili eski talep: pencere boş kategori listesi yollar, üye yine bulunur; rozet boş", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await hiddenSeller();
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46101500"]);

    const body = await windowBody(owner, listing.id);
    expect(body).toMatchObject({ categoryIds: [], itemNames: ["Baret"] });

    const res = await discovery().discoverRegistered(owner.auth, body);
    expect(res.candidates.map((c) => c.name)).toEqual(["Emniyet Ekipman AŞ"]);
    expect(res.candidates[0]!.strongMatch).toBe(true);
    expect(res.candidates[0]!.matchedCategories).toEqual([]);
    expectNoHiddenCategory(JSON.stringify(res));

    // Otomatik tur (saklanan kodları kendisi verir) ile AYNI sonuç.
    const auto = await discovery().discoverRegisteredFor(owner.company.id, {
      categoryIds: ["46101500"],
      itemNames: ["Baret"],
      listingId: listing.id,
    });
    expect(res.candidates.map((c) => c.companyId)).toEqual(auto.candidates.map((c) => c.companyId));
  });

  it("karışık talep (gizli aile + 31): eşleşmenin gizli yarısı düşmez; rozet yalnız görünür adları taşır", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await hiddenSeller();
    await visibleSeller();
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46101500", "31161500"]);

    const body = await windowBody(owner, listing.id);
    expect(body.categoryIds).toEqual(["31161500"]);

    const res = await discovery().discoverRegistered(owner.auth, body);
    const badges = new Map(res.candidates.map((c) => [c.name, c.matchedCategories]));
    expect([...badges.keys()].sort()).toEqual(["Emniyet Ekipman AŞ", "Vida Sanayi AŞ"]);
    expect(badges.get("Emniyet Ekipman AŞ")).toEqual([]);
    expect(badges.get("Vida Sanayi AŞ")).toEqual(["Bağlantı elemanları", "Vidalar", "İmalat bileşenleri"]);
    expectNoHiddenCategory(JSON.stringify(res));
  });

  it("istemcinin kategori listesi kayıtlı talebin kodlarının yerine geçmez; başkasının talebi okunmaz", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const other = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await hiddenSeller();
    await visibleSeller();
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46101500"]);

    // Kendi talebi: saklanan kod (4610…) eşleşir, istemcinin yolladığı 31 eşleştirmeye girmez.
    const own = await discovery().discoverRegistered(owner.auth, {
      type: "ALIM",
      listingId: listing.id,
      categoryIds: ["31161500"],
    });
    expect(own.candidates.map((c) => c.name)).toEqual(["Emniyet Ekipman AŞ"]);

    // Başka firmanın talep kimliği çözülmez: o talebin kodları OKUNMAZ,
    // istemcinin listesi eskisi gibi kullanılır (boşsa sonuç boş).
    const foreignBare = await discovery().discoverRegistered(other.auth, { type: "ALIM", listingId: listing.id, categoryIds: [] });
    expect(foreignBare.candidates).toEqual([]);
    const foreign = await discovery().discoverRegistered(other.auth, {
      type: "ALIM",
      listingId: listing.id,
      categoryIds: ["31161500"],
    });
    expect(foreign.candidates.map((c) => c.name)).toEqual(["Vida Sanayi AŞ"]);

    // Talepsiz açılış (yayın öncesi form) değişmedi: istemcinin listesi.
    const formOnly = await discovery().discoverRegistered(owner.auth, { type: "ALIM", categoryIds: ["31161500"] });
    expect(formOnly.candidates.map((c) => c.name)).toEqual(["Vida Sanayi AŞ"]);

    // Kategorisiz kaydedilmiş talep: okunacak saklı kod yok, istemcinin listesi eskisi gibi kullanılır.
    const uncategorised = await legacyListing(owner.company.id, owner.user.id, []);
    const fallback = await discovery().discoverRegistered(owner.auth, {
      type: "ALIM",
      listingId: uncategorised.id,
      categoryIds: ["31161500"],
    });
    expect(fallback.candidates.map((c) => c.name)).toEqual(["Vida Sanayi AŞ"]);
  });

  it("web araması (discoverExternal): kategoriler kayıtlı talepten okunur; gizli kategorinin adı isteme yazılmaz", async () => {
    const calls: Array<{ stage: string; prompt: string; system: string }> = [];
    const ai = {
      assertAiAccess: jest.fn(),
      callAi: jest.fn(async (_user: unknown, opts: { prompt: string; system: string; metadata: { stage: string } }) => {
        calls.push({ stage: opts.metadata.stage, prompt: opts.prompt, system: opts.system });
        return { text: opts.metadata.stage === "research" ? "research" : JSON.stringify({ companies: [] }), costUsd: 0 };
      }),
    };
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46101500", "31161500"]);

    // Kategori ve kalem yollamayan istemci: arama yine talebin görünür kategorisiyle koşar.
    const out = await discovery(ai).discoverExternal(owner.auth, { type: "ALIM", listingId: listing.id, categoryIds: [], itemNames: [] });

    const research = calls.filter((c) => c.stage === "research");
    expect(research.length).toBeGreaterThan(0);
    for (const c of research) expect(c.prompt).toContain("Kategoriler: Screws");
    for (const c of calls) expectNoHiddenCategory(`${c.system}\n${c.prompt}`);
    expect(out.companies).toEqual([]);

    // Yalnız gizli kategorili talep + kalemsiz istek: modele yazılacak bir şey yok, çağrı yapılmaz.
    calls.length = 0;
    const hiddenOnly = await legacyListing(owner.company.id, owner.user.id, ["46101500"]);
    const none = await discovery(ai).discoverExternal(owner.auth, { type: "ALIM", listingId: hiddenOnly.id, categoryIds: [], itemNames: [] });
    expect(none.companies).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("AI tedarikçi keşfi — eski turun dondurulmuş rozet adları (forListing)", () => {
  const runs = () => new DiscoveryRunsService(prisma as never, prisma as never, {} as never, {} as never, {} as never, {} as never);

  it("dal gizlenmeden önce yazılmış aday satırı gizli kategorinin adını döndürmez; görünür ad kalır", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const member = await makeCompanyWithUser(prisma, { tier: "SILVER", name: "Üye AŞ" });
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46101500", "31161500"], { visibility: "PUBLIC", aiDiscovery: true });
    const run = await prisma.supplierDiscoveryRun.create({
      data: { companyId: owner.company.id, listingId: listing.id, trigger: "PUBLISH", state: "DONE", finishedAt: new Date() },
    });
    await prisma.supplierDiscoveryCandidate.createMany({
      data: [
        // Tur Türkçe arayüzle koşmuş: gizli sınıf + görünür sınıf + gizli aile.
        { runId: run.id, name: "Üye AŞ", status: "MEMBER", source: "PLATFORM", memberCompanyId: member.company.id, matchedCategories: ["Ateşli silahlar", "Vidalar", "Hafif silahlar ve mühimmat"] },
        // Tur İngilizce arayüzle koşmuş.
        { runId: run.id, name: "Member Ltd", status: "MEMBER", source: "PLATFORM", matchedCategories: ["Firearms", "Screws", "Manufacturing components"] },
        // Yalnız gizli eşleşme.
        { runId: run.id, name: "Emniyet AŞ", status: "MEMBER", source: "PLATFORM", matchedCategories: ["Огнестрельное оружие", "Стрелковое оружие и боеприпасы"] },
        // Eski tur 46 segmentinin (o gün gizli segmentin) adını dondurmuş: talebin
        // bugünkü GÖRÜNÜR zincirinde 46 yok (tek 46 kodu gizli ailede) → ad dönmez.
        { runId: run.id, name: "Sektör AŞ", status: "MEMBER", source: "PLATFORM", matchedCategories: ["İş Güvenliği ve Yangın Ekipmanları", "Vidalar"] },
        // Web adayı: rozet yok.
        { runId: run.id, name: "Web GmbH", status: "SUGGESTED", source: "WEB", email: "info@web.example", matchedCategories: [] },
      ],
    });

    const view = await runs().forListing(owner.auth, listing.id);
    const byName = new Map(view.runs[0]!.candidates.map((c) => [c.name, c.matchedCategories]));
    expect(byName.get("Üye AŞ")).toEqual(["Vidalar"]);
    expect(byName.get("Member Ltd")).toEqual(["Screws", "Manufacturing components"]);
    expect(byName.get("Emniyet AŞ")).toEqual([]);
    expect(byName.get("Sektör AŞ")).toEqual(["Vidalar"]);
    expect(byName.get("Web GmbH")).toEqual([]);
    expect(view.runs[0]!.candidates).toHaveLength(5); // aday satırı düşmez, yalnız gizli adı
    expectNoHiddenCategory(JSON.stringify(view));
    // Saklanan satır değişmedi (okuma süzer, veri taşınmaz).
    expect(
      (await prisma.supplierDiscoveryCandidate.findFirstOrThrow({ where: { name: "Üye AŞ" } })).matchedCategories,
    ).toEqual(["Ateşli silahlar", "Vidalar", "Hafif silahlar ve mühimmat"]);
  });
});

/* ------------------------------------------------------------------ */
/* AI açıklama güçlendirme (seo-enrich)                                */
/* ------------------------------------------------------------------ */

describe("AI açıklama güçlendirme — istemcinin yolladığı kategori adı", () => {
  const LONG = "Baret darbeye dayanıklı ABS gövdeden üretilir ve şantiyelerde kullanılır. Ayarlanabilir iç bant taşır. Koli içinde 20 adet sevk edilir. ".repeat(2);
  const user = { companyId: "c1", userId: "u1", tier: "SILVER" } as never;

  async function promptFor(categoryName: string) {
    const ai = {
      assertAiAccess: jest.fn(),
      callAi: jest.fn().mockResolvedValue({ text: JSON.stringify({ description: LONG, keywords: [] }), downgraded: false, warned: false }),
    };
    await new SeoEnrichService(ai as never, prisma as never).enrich(user, { kind: "product", name: "Baret", categoryName });
    return ai.callAi.mock.calls[0][1].prompt as string;
  }

  it("gizli daldaki kategorinin adı isteme yazılmaz (üç dilde); görünür kategorinin adı yazılır", async () => {
    for (const hidden of [
      // gizli aile (4610) ve sınıfı
      "Hafif silahlar ve mühimmat",
      "Ateşli silahlar",
      "Firearms",
      "Огнестрельное оружие",
      // görünür ailenin gizli sınıfı (461825) ve yaprağı
      "Kişisel savunma cihazları",
      "Pepper sprays",
      // gizli segment (10)
      "Livestock",
    ]) {
      const prompt = await promptFor(hidden);
      expect(prompt).not.toContain("Kategori:");
      expectNoHiddenCategory(prompt);
      expect(prompt).toContain("Ad/Başlık: Baret");
    }
    for (const visible of [
      "Vidalar",
      "Screws",
      "Винты",
      "İmalat bileşenleri",
      // 46'nın görünür kodları sıradan kategoridir (2026-10-10).
      "İş Güvenliği ve Yangın Ekipmanları",
      "Kişisel güvenlik ve koruma",
      "Baş koruma",
      "Head protection",
    ]) {
      expect(await promptFor(visible)).toContain(`Kategori: ${visible}`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Nitelik etiketlerinin toplu çevirisi (admin)                        */
/* ------------------------------------------------------------------ */

describe("nitelik toplu çevirisi — gizli dalın nitelikleri modele gitmez", () => {
  it("yalnız görünür dalın satırı çevrilir; gizli kategorinin adı istemde yok; durum sayacı aynı kapsamı sayar", async () => {
    await prisma.categoryAttribute.createMany({
      data: [
        // Gizli dallar: gizli AİLE (4610), görünür ailenin gizli SINIFI (461825), gizli SEGMENT (10).
        { categoryId: "46100000", groupKey: "kalibre", nameTr: "Kalibre", type: "SINGLE_SELECT", options: ["Sınıf 1", "Sınıf 2"] },
        { categoryId: "46182500", groupKey: "menzil", nameTr: "Menzil", type: "TEXT", options: [] },
        { categoryId: "10100000", groupKey: "irk", nameTr: "Irk", type: "TEXT", options: [] },
        // 46 segmentinin KENDİ niteliği görünür dalda: çevrilir (2026-10-10).
        { categoryId: "46000000", groupKey: "koruma_sinifi", nameTr: "Koruma sınıfı", type: "SINGLE_SELECT", options: ["Sınıf 1", "Sınıf 2"] },
        { categoryId: "31000000", groupKey: "malzeme", nameTr: "Malzeme", type: "SINGLE_SELECT", options: ["Çelik", "Pirinç"] },
        // Görünür dalda, çevirisi hazır (TSV'den) — koşuma girmez ama sayaçta sayılır.
        { categoryId: "31160000", groupKey: "dis_tipi", nameTr: "Diş tipi", type: "TEXT", options: [], nameEn: "Thread type", nameRu: "Тип резьбы" },
      ],
    });
    const prompts: string[] = [];
    const translations = {
      enabled: true,
      completeWithFallback: jest.fn(async (_system: string, prompt: string) => {
        prompts.push(prompt);
        const rows = JSON.parse(prompt.split("\n").at(-1)!) as Array<{ id: string; options: string[] }>;
        return {
          text: JSON.stringify(
            rows.map((r) => ({
              id: r.id,
              en: "Material",
              ru: "Материал",
              optionsEn: r.options.map((_, i) => `Option ${i + 1}`),
              optionsRu: r.options.map((_, i) => `Вариант ${i + 1}`),
            })),
          ),
          model: "test",
          cost: 0,
        };
      }),
    };
    const svc = new CategoryTranslationService(prisma as never, translations as never);

    // Kapsam = görünür dallar: 3 satır (biri çevrili).
    expect(await svc.attributeStatus()).toMatchObject({ total: 3, translated: { en: 1, ru: 1 } });

    expect(svc.startAttributes()).toEqual({ started: true });
    await settle(async () => !(await svc.attributeStatus()).running);

    const sent = prompts.join("\n");
    expect(sent).toContain('"category":"İmalat bileşenleri"');
    expect(sent).toContain('"tr":"Malzeme"');
    expect(sent).toContain('"category":"İş Güvenliği ve Yangın Ekipmanları"');
    expect(sent).toContain('"tr":"Koruma sınıfı"');
    for (const hidden of ["Kalibre", "Menzil", "Irk"]) expect(sent).not.toContain(hidden);
    expectNoHiddenCategory(sent);

    const rows = await prisma.categoryAttribute.findMany({ select: { groupKey: true, nameEn: true, nameRu: true, optionsEn: true } });
    const byKey = new Map(rows.map((r) => [r.groupKey, r]));
    expect(byKey.get("malzeme")).toMatchObject({ nameEn: "Material", nameRu: "Материал", optionsEn: ["Option 1", "Option 2"] });
    expect(byKey.get("koruma_sinifi")).toMatchObject({ nameEn: "Material", nameRu: "Материал", optionsEn: ["Option 1", "Option 2"] });
    for (const key of ["kalibre", "menzil", "irk"]) {
      expect(byKey.get(key)).toMatchObject({ nameEn: null, nameRu: null, optionsEn: [] });
    }
    expect(await svc.attributeStatus()).toMatchObject({ total: 3, translated: { en: 3, ru: 3 }, running: false });
  });
});

/* ------------------------------------------------------------------ */
/* AI kategori önerisi (kalemlerden) + AI arama ipucu çözümü           */
/* ------------------------------------------------------------------ */

/**
 * İki yüzey de kataloğu GEZDİRİR ve modelin gördüğü / döndürdüğü şeyi koda
 * çevirir: öneri modele bir aile listesi, sonra seçilen ailelerin sınıflarını
 * yazar; ipucu çözücü modelin yazdığı ifadeyi katalogda arar. Gizli aile ve
 * görünür ailenin gizli sınıfı ikisinde de YOKTUR (2026-10-10: gizlemenin
 * birimi kod öneki) — modele adı yazılmaz, model kodu kendi yazsa da öneriye
 * dönüşmez, ifade o koda çözülmez.
 */
describe("AI kategori önerisi ve ipucu çözümü — gizli aile / sınıf sunulmaz, koda çözülmez", () => {
  beforeEach(async () => {
    // Öneri ağacı `parentId` ile, ipucu araması `searchText` ile çalışır.
    for (const [id, level, nameTr] of CATALOG) {
      const parentId =
        level === 1 ? null : level === 2 ? `${id.slice(0, 2)}000000` : level === 3 ? `${id.slice(0, 4)}0000` : `${id.slice(0, 6)}00`;
      await prisma.category.update({ where: { id }, data: { parentId, searchText: foldSearchText(nameTr) } });
    }
  });

  function suggestRig(responses: string[]) {
    const prompts: string[] = [];
    const ai = {
      assertAiAccess: jest.fn(),
      callAi: jest.fn(async (_user: unknown, opts: { prompt: string }) => {
        prompts.push(opts.prompt);
        return { text: responses[prompts.length - 1] ?? JSON.stringify({ codes: [] }) };
      }),
    };
    return { svc: new CategorySuggestService(ai as never, prisma as never), prompts };
  }

  it("öneri: aile listesinde gizli aile yok, sınıf listesinde görünür ailenin gizli sınıfı yok; modelin yazdığı gizli kod öneri olmaz", async () => {
    const { svc, prompts } = suggestRig([
      // Model gizli aileleri de "seçiyor": listede olmadıkları için düşerler.
      JSON.stringify({ codes: ["46100000", "10100000", "46180000"] }),
      JSON.stringify({ codes: ["46182500", "46101500", "46181700"], keywords: ["baret"] }),
    ]);

    const res = await svc.suggestForItems({ userId: "u1", companyId: "c1" } as never, [{ name: "Baret" }]);

    expect(prompts).toHaveLength(2);
    // Aşama 1 — aileler: 46'nın görünür ailesi ve 31 var; 4610 ve 10'un ailesi yok.
    expect(prompts[0]).toContain("46180000 Kişisel güvenlik ve koruma");
    expect(prompts[0]).toContain("31160000 Bağlantı elemanları");
    // Aşama 2 — yalnız seçilen GÖRÜNÜR ailenin görünür sınıfı.
    expect(prompts[1]).toContain("46181700 Baş koruma");
    expect(prompts[1]).not.toContain("31161500");
    for (const prompt of prompts) expectNoHiddenCategory(prompt);
    expect(res).toEqual({ categoryIds: ["46181700"], keywords: ["baret"] });
  });

  it("öneri: model yalnız gizli aileyi seçerse ikinci aşama hiç koşmaz, öneri boş döner", async () => {
    const { svc, prompts } = suggestRig([JSON.stringify({ codes: ["46100000"] })]);

    expect(await svc.suggest({ userId: "u1", companyId: "c1" } as never, [{ name: "Tabanca" }])).toEqual([]);
    expect(prompts).toHaveLength(1);
  });

  it.each([false, true])("ipucu çözümü (discoveryOnly=%s): gizli dalın adı koda çözülmez; 46'nın görünür sınıfı çözülür", async (discoveryOnly) => {
    const hints = ["ateşli silahlar", "biber gazı spreyleri", "kişisel savunma cihazları", "çiftlik hayvanları", "baş koruma", "vidalar"];

    const resolved = await resolveCategoryHints(prisma as never, hints, { discoveryOnly });

    expect([...resolved.keys()].sort()).toEqual(["baş koruma", "vidalar"]);
    expect(resolved.get("baş koruma")).toMatchObject({ id: "46181700", nameTr: "Baş koruma" });
    expect(resolved.get("vidalar")).toMatchObject({ id: "31161500" });
    expectNoHiddenCategory(JSON.stringify([...resolved.values()]));
  });
});

/* ------------------------------------------------------------------ */
/* 2026-10-10 — 46 görünür; gizli SINIF (461825) ve 46'nın görünür kodları */
/* ------------------------------------------------------------------ */

describe("46 görünür segment — gizli sınıf gizli aile gibi davranır, görünür kodlar sıradan kategoridir", () => {
  const discovery = () => new SupplierDiscoveryService(prisma as never, {} as never, prisma as never);

  async function seller(name: string, data: { sellerCategoryIds: string[]; sellerSubCategoryIds: string[] }) {
    const s = await makeCompanyWithUser(prisma, { name, tier: "SILVER" });
    await prisma.company.update({ where: { id: s.company.id }, data });
    return s;
  }

  it("dış davet ve önizleme: gizli sınıfın yaprağı yazılmaz; 46181700 adıyla gider (üç dilde)", async () => {
    const service = makeConnections();
    const email = makeEmail();
    const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, makeConfig() as never, undefined as never);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46182501", "46101500", "46181700"]);

    await service.inviteExternalForListing(owner.auth, listing.id, ["dis@firma.com"]);
    await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - 60_000) } });
    expect((await dispatcher.dispatch()).sent).toBe(1);

    const data = (email.send.mock.calls.at(-1)![0] as SendArg).templateData.data;
    const categories = data.categories as string[];
    expect(categories).toHaveLength(1);
    expect(["Baş koruma", "Head protection", "Защита головы"]).toContain(categories[0]);
    expectNoHiddenCategory(JSON.stringify(data));

    const token = (await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "dis@firma.com" } })).token;
    for (const [locale, name] of [["tr", "Baş koruma"], ["en", "Head protection"], ["ru", "Защита головы"]] as const) {
      const preview = await runWithLocale(locale, () => service.invitePreview(token));
      expect(preview.categories).toEqual([name]);
      expectNoHiddenCategory(JSON.stringify(preview));
    }
  });

  it("web araştırması istemi: gizli sınıf yazılmaz, 46'nın görünür sınıfı İngilizce adıyla yazılır", async () => {
    const { runner, calls } = recordingRunner();
    await discovery().searchWeb(
      { buyerCountry: "TR", targetCountries: ["TR"], locale: "tr", categoryIds: ["46182501", "46182500", "46181700"], itemNames: ["Baret"] },
      runner,
    );
    const research = calls.find((c) => c.stage === "research")!;
    expect(research.prompt).toContain("Kategoriler: Head protection");
    for (const c of calls) expectNoHiddenCategory(`${c.system}\n${c.prompt}`);

    // Yalnız gizli sınıf + kalemsiz istek: modele yazılacak bir şey yok.
    const bare = recordingRunner();
    const out = await discovery().searchWeb(
      { buyerCountry: "TR", targetCountries: ["TR"], locale: "tr", categoryIds: ["46182501"], itemNames: [] },
      bare.runner,
    );
    expect(out.companies).toEqual([]);
    expect(bare.calls).toHaveLength(0);
  });

  it("eşleşme rozeti: yalnız gizli sınıf seçimi olan üye bulunur ama görünür ataları (4618, 46) rozet OLMAZ", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await seller("Sprey Ticaret AŞ", { sellerCategoryIds: ["46000000"], sellerSubCategoryIds: ["46180000", "46182500", "46182501"] });

    const res = await discovery().discoverRegisteredFor(buyer.company.id, { categoryIds: ["46182501"], locale: "tr" });

    expect(res.candidates.map((c) => c.name)).toEqual(["Sprey Ticaret AŞ"]);
    expect(res.candidates[0]!.strongMatch).toBe(true); // eşleştirme saklanan kodlarla
    expect(res.candidates[0]!.matchedCategories).toEqual([]);
    expectNoHiddenCategory(JSON.stringify(res));
    expect(JSON.stringify(res)).not.toContain("İş Güvenliği ve Yangın Ekipmanları");
  });

  it("eşleşme rozeti: 46'nın görünür sınıfını beyan eden üye, aile ve segment adıyla birlikte rozet alır", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await seller("Baret Sanayi AŞ", {
      sellerCategoryIds: ["46000000"],
      // Yanında gizli bir seçim de var: rozetleri etkilemez, görünür zincir durur.
      sellerSubCategoryIds: ["46100000", "46101500", "46180000", "46181700"],
    });

    const res = await discovery().discoverRegisteredFor(buyer.company.id, { categoryIds: ["46181700"], locale: "en" });

    expect(res.candidates.map((c) => c.name)).toEqual(["Baret Sanayi AŞ"]);
    expect(res.candidates[0]!.matchedCategories).toEqual([
      "Personal safety and protection",
      "Head protection",
      "Workplace Safety and Fire Equipment",
    ]);
    expectNoHiddenCategory(JSON.stringify(res));
  });

  it("eşleşme rozeti: talebin kodu yalnız gizli daldaysa görünür atası (46) rozet OLMAZ — 46'yı görünür beyan eden üyede de", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    // Üyenin beyanı tümüyle görünür (46 › 4618 › baş koruma): gösterilen beyanında 46 VAR.
    await seller("Baret Sanayi AŞ", { sellerCategoryIds: ["46000000"], sellerSubCategoryIds: ["46180000", "46181700"] });

    // Talep gizli ailede (4610): kategorisi hiçbir yüzeyde görünmez. Üye sektör
    // eşleşmesiyle yine bulunur (eşleştirme saklanan kodlarla), ama rozet talebin
    // GÖRÜNÜR kodlarından türediği için gizli kodun görünür atası adlandırılmaz.
    for (const hiddenRequest of [["46101500"], ["46182501"]]) {
      const res = await discovery().discoverRegisteredFor(buyer.company.id, { categoryIds: hiddenRequest, locale: "tr" });
      expect(res.candidates.map((c) => c.name)).toEqual(["Baret Sanayi AŞ"]);
      expect(res.candidates[0]!.matchedCategories).toEqual([]);
      expect(JSON.stringify(res)).not.toContain("İş Güvenliği ve Yangın Ekipmanları");
      expectNoHiddenCategory(JSON.stringify(res));
    }

    // Karışık talep (gizli aile + 46'nın görünür sınıfı): rozet görünür zincirden gelir.
    const mixed = await discovery().discoverRegisteredFor(buyer.company.id, {
      categoryIds: ["46101500", "46181700"],
      locale: "tr",
    });
    expect(mixed.candidates[0]!.matchedCategories).toEqual([
      "Kişisel güvenlik ve koruma",
      "Baş koruma",
      "İş Güvenliği ve Yangın Ekipmanları",
    ]);
    expectNoHiddenCategory(JSON.stringify(mixed));
  });

  it("eski turun dondurulmuş rozeti: talebin görünür 46 zinciri beyaz listededir, gizli sınıfın adı değildir", async () => {
    const runs = new DiscoveryRunsService(prisma as never, prisma as never, {} as never, {} as never, {} as never, {} as never);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await legacyListing(owner.company.id, owner.user.id, ["46182501", "46181700"], { visibility: "PUBLIC", aiDiscovery: true });
    const run = await prisma.supplierDiscoveryRun.create({
      data: { companyId: owner.company.id, listingId: listing.id, trigger: "PUBLISH", state: "DONE", finishedAt: new Date() },
    });
    await prisma.supplierDiscoveryCandidate.create({
      data: {
        runId: run.id,
        name: "Üye AŞ",
        status: "MEMBER",
        source: "PLATFORM",
        matchedCategories: ["Biber gazı spreyleri", "Kişisel savunma cihazları", "Baş koruma", "Kişisel güvenlik ve koruma", "İş Güvenliği ve Yangın Ekipmanları"],
      },
    });

    const view = await runs.forListing(owner.auth, listing.id);

    expect(view.runs[0]!.candidates[0]!.matchedCategories).toEqual([
      "Baş koruma",
      "Kişisel güvenlik ve koruma",
      "İş Güvenliği ve Yangın Ekipmanları",
    ]);
    expectNoHiddenCategory(JSON.stringify(view));
  });
});
