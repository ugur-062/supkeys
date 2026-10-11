/**
 * İKİ KATALOG — talep/ilan (Ariba Discovery) vs firma seçimi (tam katalog).
 *
 * Ariba'nın iki dışa aktarımı var ve yalnız L4 yaprakta ayrışıyorlar: 13
 * yaprak yalnız tam katalogda. Bu spec o ayrımın SÖZLEŞMESİ:
 *
 *   • Talep/ilan discovery DIŞI bir kod TAŞIYAMAZ — kapı backend'de, istemcinin
 *     `catalog` parametresi göndermesine bağlı değil.
 *   • Firma "hangi alandasınız" seçimi TAM kataloğu görür — o 13 yaprak dahil.
 *   • Gösterim uçları (`children`, `search-tree`) `catalog`'a uyar.
 *   • `by-ids` KATALOĞA göre süzmez: kayıtlı bir kodu discovery dışı olsa da
 *     çözebilmeli. (Gizli SEGMENT ayrı kural — o kod hiç çözülmez:
 *     `hidden-category-public-surfaces.spec.ts`.)
 */
import { foldSearchText } from "@rothern/shared";
import { CategoryService } from "../../src/modules/categories/services/category.service";
import { validateCategorySelection } from "../../src/common/helpers/category-selection.helper";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { makeService } from "./make-service";

const service = () => new CategoryService(prisma as unknown as PrismaService);

/** Discovery dışı yaprağın gerçek örneği: "Plastik Kasalar". */
const SEG = "24000000";
const FAM = "24110000";
const CLS = "24112000";
const LEAF_FULL_ONLY = "24112008"; // inDiscovery=false
const LEAF_BOTH = "24112004"; // inDiscovery=true

async function makeCategory(opts: {
  code: string;
  nameTr: string;
  level: number;
  parentId?: string | null;
  inDiscovery?: boolean;
}) {
  return prisma.category.create({
    data: {
      id: opts.code,
      code: opts.code,
      nameTr: opts.nameTr,
      keywords: "",
      searchText: foldSearchText(opts.nameTr),
      level: opts.level,
      parentId: opts.parentId ?? null,
      isActive: true,
      sortOrder: 0,
      inDiscovery: opts.inDiscovery ?? true,
    },
  });
}

/** Segment → Aile → Sınıf → iki yaprak (biri discovery dışı). */
async function seedTree() {
  await makeCategory({ code: SEG, nameTr: "Ambalaj malzemeleri", level: 1 });
  await makeCategory({
    code: FAM,
    nameTr: "Kutular ve kasalar",
    level: 2,
    parentId: SEG,
  });
  await makeCategory({
    code: CLS,
    nameTr: "Kasalar",
    level: 3,
    parentId: FAM,
  });
  await makeCategory({
    code: LEAF_BOTH,
    nameTr: "Ahşap Kasalar",
    level: 4,
    parentId: CLS,
    inDiscovery: true,
  });
  await makeCategory({
    code: LEAF_FULL_ONLY,
    nameTr: "Plastik Kasalar",
    level: 4,
    parentId: CLS,
    inDiscovery: false,
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
  await seedTree();
});

describe("gösterim uçları — catalog parametresi", () => {
  it("children: discovery yalnız discovery yaprağını döner, full ikisini de", async () => {
    const svc = service();
    const disc = await svc.childrenOf(CLS, "discovery");
    expect(disc.map((c) => c.code)).toEqual([LEAF_BOTH]);

    const full = await svc.childrenOf(CLS, "full");
    expect(full.map((c) => c.code).sort()).toEqual(
      [LEAF_BOTH, LEAF_FULL_ONLY].sort(),
    );
  });

  it("children varsayılanı FULL — parametre gelmezse katalog daralmaz", async () => {
    // Fail-open bilinçli: `catalog` yalnız gösterim seçer, yetki kapısı değil.
    // Ters varsayım firma kategori seçimini sessizce budardı.
    const full = await service().childrenOf(CLS);
    expect(full).toHaveLength(2);
  });

  it("childCount da süzülür — açılınca boş gelen 'açılabilir' sınıf olmaz", async () => {
    // Sınıfın TEK çocuğu discovery dışı olsun.
    await prisma.category.delete({ where: { id: LEAF_BOTH } });
    const svc = service();

    const [clsDisc] = await svc.childrenOf(FAM, "discovery");
    expect(clsDisc?.childCount).toBe(0);

    const [clsFull] = await svc.childrenOf(FAM, "full");
    expect(clsFull?.childCount).toBe(1);
  });

  it("search-tree: discovery dışı yaprak discovery aramasında ÇIKMAZ", async () => {
    const svc = service();

    const full = await svc.searchHierarchical("Plastik Kasalar", "full");
    const fullCodes = full.segments
      .flatMap((s) => s.families)
      .flatMap((f) => f.classes)
      .flatMap((c) => c.commodities)
      .map((x) => x.code);
    expect(fullCodes).toContain(LEAF_FULL_ONLY);

    const disc = await svc.searchHierarchical("Plastik Kasalar", "discovery");
    const discCodes = disc.segments
      .flatMap((s) => s.families)
      .flatMap((f) => f.classes)
      .flatMap((c) => c.commodities)
      .map((x) => x.code);
    expect(discCodes).not.toContain(LEAF_FULL_ONLY);
  });

  it("by-ids KATALOĞA göre SÜZMEZ — firma kendi seçtiği discovery dışı kodu çözebilmeli", async () => {
    const rows = await service().getByIds([LEAF_FULL_ONLY]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nameTr).toBe("Plastik Kasalar");
  });
});

describe("kapı — talep/ilan yalnız discovery kodu taşıyabilir", () => {
  const dto = (over: Record<string, unknown>) => ({
    type: "ALIM",
    format: "RFQ",
    isInternational: false,
    visibility: "CONNECTIONS",
    title: "Katalog kapısı",
    closesAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
    ...over,
  });

  it("discovery DIŞI kod ile ilan açılamaz — istemci ne gönderirse göndersin", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const { service: listings } = makeService();
    await expect(
      listings.create(
        owner.auth,
        dto({ categoryIds: [LEAF_FULL_ONLY] }) as never,
      ),
    ).rejects.toThrow(/Geçersiz kategori/);
  });

  it("discovery kodu ile ilan açılır", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const { service: listings } = makeService();
    const l = await listings.create(
      owner.auth,
      dto({ categoryIds: [LEAF_BOTH] }) as never,
    );
    const saved = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(saved.categoryIds).toEqual([LEAF_BOTH]);
  });
});

describe("firma seçimi — TAM katalog", () => {
  it("discovery DIŞI yaprak firma ALT kategorisi olarak seçilebilir", async () => {
    const res = await validateCategorySelection(
      prisma as unknown as PrismaService,
      [SEG],
      [LEAF_FULL_ONLY],
    );
    // Yaprak ata zinciriyle saklanır (code-category-8: dönüşüm sunucuda da).
    expect(res.subIds).toEqual([LEAF_FULL_ONLY, FAM, CLS]);
    expect(res.mainNames).toEqual(["Ambalaj malzemeleri"]);
  });

  it("ana liste yanlış segmenti taşısa da alt kodun segmenti eklenir (code-category-8)", async () => {
    await makeCategory({ code: "11000000", nameTr: "Mineraller", level: 1 });
    const res = await validateCategorySelection(
      prisma as unknown as PrismaService,
      ["11000000"],
      [LEAF_BOTH],
    );
    expect(res.mainIds).toEqual(["11000000", SEG]);
    expect(res.subIds).toEqual([LEAF_BOTH, FAM, CLS]);
    expect(res.mainNames).toEqual(["Mineraller", "Ambalaj malzemeleri"]);
  });
});

/**
 * 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
 * görünür segmenttir; altında 4610 ailesi (silah) ve 4618 ailesinin 461825
 * sınıfı gizli kalır. Kayıt akışının beyan kapısı (`validateCategorySelection`)
 * gizli aile / sınıfı gizli segment gibi reddeder; 46'nın görünür kodları
 * sıradan seçimdir.
 */
describe("firma seçimi — 46 görünür, gizli aile (4610) ve gizli sınıf (461825) seçilemez", () => {
  async function seed46() {
    await makeCategory({ code: "46000000", nameTr: "İş Güvenliği ve Yangın Ekipmanları", level: 1 });
    await makeCategory({ code: "46100000", nameTr: "Hafif silahlar ve mühimmat", level: 2, parentId: "46000000" });
    await makeCategory({ code: "46101500", nameTr: "Ateşli silahlar", level: 3, parentId: "46100000" });
    await makeCategory({ code: "46180000", nameTr: "Kişisel güvenlik ve koruma", level: 2, parentId: "46000000" });
    await makeCategory({ code: "46181500", nameTr: "Koruyucu giysiler", level: 3, parentId: "46180000" });
    await makeCategory({ code: "46182500", nameTr: "Kişisel güvenlik cihazları veya silahları", level: 3, parentId: "46180000" });
    await makeCategory({ code: "46182501", nameTr: "Biber gazı spreyleri", level: 4, parentId: "46182500" });
    await makeCategory({ code: "10000000", nameTr: "Canlı Bitki ve Hayvan Malzemeleri", level: 1 });
  }
  const select = (main: string[], sub: string[]) =>
    validateCategorySelection(prisma as unknown as PrismaService, main, sub);

  it("46181500 seçilir: segmenti ve ailesiyle saklanır; segmentin tamamı da seçilebilir", async () => {
    await seed46();
    const res = await select([], ["46181500"]);
    expect(res.mainIds).toEqual(["46000000"]);
    expect(res.subIds).toEqual(["46181500", "46180000"]);
    expect(res.mainNames).toEqual(["İş Güvenliği ve Yangın Ekipmanları"]);
    expect((await select(["46000000"], [])).mainIds).toEqual(["46000000"]);
  });

  it.each([
    ["gizli aile", "46100000"],
    ["gizli ailenin sınıfı", "46101500"],
    ["gizli sınıf", "46182500"],
    ["gizli sınıfın yaprağı", "46182501"],
  ])("%s alt kategori olarak reddedilir (görünür segmenti ana listede olsa da)", async (_level, code) => {
    await seed46();
    await expect(select(["46000000"], [code])).rejects.toThrow(/Geçersiz alt kategori/i);
    await expect(select(["46000000"], ["46181500", code])).rejects.toThrow(/Geçersiz alt kategori/i);
  });

  it("tümüyle gizli segment ana kategori olarak eskisi gibi reddedilir", async () => {
    await seed46();
    await expect(select(["10000000"], [])).rejects.toThrow();
  });
});
