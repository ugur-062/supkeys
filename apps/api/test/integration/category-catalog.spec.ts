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
 *   • `by-ids` süzmez: kayıtlı bir kodu her hâlükârda çözebilmeli.
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

  it("by-ids SÜZMEZ — firma kendi seçtiği kodu her zaman çözebilmeli", async () => {
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
    expect(res.subIds).toEqual([LEAF_FULL_ONLY]);
    expect(res.mainNames).toEqual(["Ambalaj malzemeleri"]);
  });
});
