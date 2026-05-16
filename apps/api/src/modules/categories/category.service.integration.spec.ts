/**
 * V2-6 — UNSPSC kategori servisi.
 *
 * Test edilen:
 *   - getRoots: level 1 + isActive
 *   - getChildren: parent ID → direkt children
 *   - search: <2 char → boş, Level 3+4 match
 *   - searchHierarchical: tree shape
 *   - getByIds: chip listesi shape
 *   - validateIds: minLevel/exactLevel + bilinmeyen ID 404
 *   - buildBreadcrumb: saf fonksiyon
 */
import { TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  CategoryService,
  buildBreadcrumb,
} from "./services/category.service";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";
import { createCategoryTree } from "../../../test/helpers/factories";

describe("CategoryService", () => {
  let moduleRef: TestingModule;
  let service: CategoryService;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({ providers: [CategoryService] });
    service = moduleRef.get(CategoryService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe("getRoots — Level 1 (Segment)", () => {
    it("boş DB → boş array", async () => {
      const result = await service.getRoots();
      expect(result).toEqual([]);
    });

    it("aktif Level 1 kategoriler döner, çocuk sayısı dahil", async () => {
      await createCategoryTree(prisma);
      await createCategoryTree(prisma);

      const result = await service.getRoots();
      expect(result.length).toBe(2);
      expect(result[0]?.level).toBe(1);
      expect(result[0]?._count?.children).toBeGreaterThanOrEqual(1);
    });

    it("inactive Level 1 → gizlenir", async () => {
      const { segment } = await createCategoryTree(prisma);
      await prisma.category.update({
        where: { id: segment.id },
        data: { isActive: false },
      });
      const result = await service.getRoots();
      expect(result).toEqual([]);
    });

    it("Level 2+ kategoriler döndürülmez", async () => {
      await createCategoryTree(prisma);
      const result = await service.getRoots();
      expect(result.every((c) => c.level === 1)).toBe(true);
    });
  });

  describe("getChildren — Lazy expand", () => {
    it("Segment.id → o segment'in Family'leri", async () => {
      const { segment, family } = await createCategoryTree(prisma);

      const result = await service.getChildren(segment.id);
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(family.id);
      expect(result[0]?.level).toBe(2);
    });

    it("Family.id → o family'nin Class'ları", async () => {
      const { family, klass } = await createCategoryTree(prisma);
      const result = await service.getChildren(family.id);
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(klass.id);
      expect(result[0]?.level).toBe(3);
    });

    it("Commodity (Level 4) → boş array (yaprak)", async () => {
      const { commodity } = await createCategoryTree(prisma);
      const result = await service.getChildren(commodity.id);
      expect(result).toEqual([]);
    });

    it("inactive children gizlenir", async () => {
      const { segment, family } = await createCategoryTree(prisma);
      await prisma.category.update({
        where: { id: family.id },
        data: { isActive: false },
      });
      const result = await service.getChildren(segment.id);
      expect(result).toEqual([]);
    });
  });

  describe("search — Level 3+4 only", () => {
    it("<2 char → boş array (min length guard)", async () => {
      await createCategoryTree(prisma);
      expect(await service.search("")).toEqual([]);
      expect(await service.search("a")).toEqual([]);
      expect(await service.search("  ")).toEqual([]);
    });

    it("Class adı match → breadcrumb dahil döner", async () => {
      await createCategoryTree(prisma);
      // class.nameTr "Test Class N"
      const result = await service.search("Class");
      const klassMatch = result.find((c) => c.level === 3);
      expect(klassMatch).toBeDefined();
      expect(klassMatch?.breadcrumb).toContain("›"); // breadcrumb format
    });

    it("Commodity adı match → level 4 döner", async () => {
      await createCategoryTree(prisma);
      const result = await service.search("Commodity");
      const com = result.find((c) => c.level === 4);
      expect(com).toBeDefined();
    });

    it("Segment/Family adı match → DÖNMEMELİ (sadece level 3+4)", async () => {
      await createCategoryTree(prisma);
      const result = await service.search("Segment");
      expect(result.every((c) => c.level >= 3)).toBe(true);
    });
  });

  describe("searchHierarchical — tree shape", () => {
    it("<2 char → boş segments", async () => {
      const result = await service.searchHierarchical("a");
      expect(result.segments).toEqual([]);
    });

    it("Class match → segment > family > class hiyerarşisi tree olarak döner", async () => {
      await createCategoryTree(prisma);
      const result = await service.searchHierarchical("Class");

      expect(result.segments.length).toBe(1);
      const seg = result.segments[0]!;
      expect(seg.level).toBe(1);
      expect(seg.families.length).toBe(1);
      const fam = seg.families[0]!;
      expect(fam.classes.length).toBe(1);
      expect(fam.classes[0]?.isMatch).toBe(true);
    });

    it("Hiç eşleşme yok → boş segments", async () => {
      await createCategoryTree(prisma);
      const result = await service.searchHierarchical("yokyok");
      expect(result.segments).toEqual([]);
    });
  });

  describe("getByIds — chip listesi", () => {
    it("boş array → boş array (no-op)", async () => {
      const result = await service.getByIds([]);
      expect(result).toEqual([]);
    });

    it("ID listesi → breadcrumb ile döner", async () => {
      const { klass } = await createCategoryTree(prisma);
      const result = await service.getByIds([klass.id]);
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(klass.id);
      expect(result[0]?.breadcrumb).toContain("›");
    });

    it("bilinmeyen ID → boş array (404 atmaz, sadece atlar)", async () => {
      const result = await service.getByIds(["yok"]);
      expect(result).toEqual([]);
    });
  });

  describe("validateIds — level guard", () => {
    it("boş array → no-op (no throw)", async () => {
      await expect(service.validateIds([])).resolves.toBeUndefined();
    });

    it("minLevel=3 + Class ID → ok", async () => {
      const { klass } = await createCategoryTree(prisma);
      await expect(
        service.validateIds([klass.id], { minLevel: 3 }),
      ).resolves.toBeUndefined();
    });

    it("minLevel=3 + Segment ID → 400 (Sadece Class/Commodity)", async () => {
      const { segment } = await createCategoryTree(prisma);
      await expect(
        service.validateIds([segment.id], { minLevel: 3 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("minLevel=3 + Family ID → 400", async () => {
      const { family } = await createCategoryTree(prisma);
      await expect(
        service.validateIds([family.id], { minLevel: 3 }),
      ).rejects.toThrow("Class veya Commodity");
    });

    it("exactLevel=1 + Segment ID → ok (Tedarikçi profili)", async () => {
      const { segment } = await createCategoryTree(prisma);
      await expect(
        service.validateIds([segment.id], { exactLevel: 1 }),
      ).resolves.toBeUndefined();
    });

    it("exactLevel=1 + Class ID → 400 (sadece Segment)", async () => {
      const { klass } = await createCategoryTree(prisma);
      await expect(
        service.validateIds([klass.id], { exactLevel: 1 }),
      ).rejects.toThrow("Sadece ana başlık");
    });

    it("bilinmeyen ID → 404", async () => {
      await expect(
        service.validateIds(["nonexistent"], { minLevel: 3 }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.validateIds(["nonexistent"], { minLevel: 3 }),
      ).rejects.toThrow("Geçersiz kategori ID");
    });

    it("numeric arg backward-compat → minLevel olarak yorumlanır", async () => {
      const { klass } = await createCategoryTree(prisma);
      await expect(service.validateIds([klass.id], 3)).resolves.toBeUndefined();
    });

    it("inactive kategori → 404 (treat as missing)", async () => {
      const { klass } = await createCategoryTree(prisma);
      await prisma.category.update({
        where: { id: klass.id },
        data: { isActive: false },
      });
      await expect(
        service.validateIds([klass.id], { minLevel: 3 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe("buildBreadcrumb — saf fonksiyon", () => {
  it("null → boş string", () => {
    expect(buildBreadcrumb(null)).toBe("");
  });

  it("undefined → boş string", () => {
    expect(buildBreadcrumb(undefined)).toBe("");
  });

  it("tek node level 1 + segmentLetter → 'A. Segment Adı'", () => {
    const node = {
      level: 1,
      nameTr: "Bilişim",
      segmentLetter: "G",
      parent: null,
    };
    expect(buildBreadcrumb(node)).toBe("G. Bilişim");
  });

  it("tek node level 1 segmentLetter yok → sadece ad", () => {
    const node = {
      level: 1,
      nameTr: "Bilişim",
      parent: null,
    };
    expect(buildBreadcrumb(node)).toBe("Bilişim");
  });

  it("4-seviye zincir → tüm parent'lar dahil", () => {
    const node = {
      level: 4,
      nameTr: "Laptop",
      parent: {
        level: 3,
        nameTr: "Bilgisayar Donanımı",
        parent: {
          level: 2,
          nameTr: "Bilişim Donanımı",
          parent: {
            level: 1,
            nameTr: "Teknoloji",
            segmentLetter: "G",
            parent: null,
          },
        },
      },
    };
    expect(buildBreadcrumb(node)).toBe(
      "G. Teknoloji › Bilişim Donanımı › Bilgisayar Donanımı › Laptop",
    );
  });

  it("eksik zincir (parent null'da bitiyor) → mevcut kısmı verir", () => {
    const node = {
      level: 3,
      nameTr: "Class",
      parent: null,
    };
    expect(buildBreadcrumb(node)).toBe("Class");
  });
});
