/**
 * Kategori arama — TR-katlanmış searchText yolu (searchTree).
 *
 * Kök neden: Postgres lower('İ') = "i + combining dot" olduğundan ham ILIKE
 * '%iskele%' "İskele sistemleri"ni BULAMIYORDU; aksansız yazım ("jenerator")
 * da eşleşmiyordu. Bu spec, fold edilen sorgu + searchText kolonunun bu iki
 * sınıfı da yakaladığının sözleşmesidir.
 */
import { foldSearchText } from "@rothern/shared";
import { CategoryService } from "../../src/modules/categories/services/category.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";

const service = () => new CategoryService(prisma as unknown as PrismaService);

async function makeCategory(opts: {
  code: string;
  nameTr: string;
  level: number;
  parentId?: string | null;
}) {
  return prisma.category.create({
    data: {
      id: opts.code,
      code: opts.code,
      nameTr: opts.nameTr,
      searchText: foldSearchText(opts.nameTr),
      level: opts.level,
      parentId: opts.parentId ?? null,
      isActive: true,
      sortOrder: 0,
    },
  });
}

/** Segment → Family → Class zinciri kurar, class kaydını döndürür. */
async function makeChain(names: { seg: string; fam: string; cls: string }) {
  await makeCategory({ code: "30000000", nameTr: names.seg, level: 1 });
  await makeCategory({
    code: "30990000",
    nameTr: names.fam,
    level: 2,
    parentId: "30000000",
  });
  return makeCategory({
    code: "30991500",
    nameTr: names.cls,
    level: 3,
    parentId: "30990000",
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("CategoryService.searchTree — TR fold", () => {
  it("küçük harf sorgu, büyük İ ile başlayan kategoriyi bulur", async () => {
    await makeChain({
      seg: "Yapı ve inşaat",
      fam: "İskele, kalıp ve şantiye sistemleri",
      cls: "İskele sistemleri",
    });

    const res = await service().searchHierarchical("iskele");

    const classes = res.segments.flatMap((s) =>
      s.families.flatMap((f) => f.classes),
    );
    expect(classes.map((c) => c.nameTr)).toContain("İskele sistemleri");
    expect(res.truncated).toBe(false);
  });

  it("aksansız sorgu ('jenerator') aksanlı adı ('Jeneratörler') bulur", async () => {
    await makeChain({
      seg: "Enerji ekipmanları",
      fam: "Güç kaynakları",
      cls: "Jeneratörler",
    });

    const res = await service().searchHierarchical("jenerator");

    const classes = res.segments.flatMap((s) =>
      s.families.flatMap((f) => f.classes),
    );
    expect(classes.map((c) => c.nameTr)).toContain("Jeneratörler");
  });

  it("family adı eşleşince altındaki Class'lar sonuç ağacına girer", async () => {
    await makeChain({
      seg: "Elektrik",
      fam: "Pano ve dağıtım sistemleri",
      cls: "Alçak gerilim panoları",
    });

    const res = await service().searchHierarchical("pano ve dagitim");

    const classes = res.segments.flatMap((s) =>
      s.families.flatMap((f) => f.classes),
    );
    expect(classes.map((c) => c.nameTr)).toContain("Alçak gerilim panoları");
    // Family başlığı eşleşti diye Class vurgulanmaz — isMatch yalnız ada
    // eşleşen düğümde (Class adı "pano" içerdiğinden burada true olabilir;
    // sözleşme: en az listeye girmesi).
  });

  it("searchText'i boş (legacy) satırda nameTr ILIKE yedeği çalışır", async () => {
    await makeChain({
      seg: "Metal",
      fam: "Çelik ürünler",
      cls: "Paslanmaz sac",
    });
    await prisma.category.update({
      where: { id: "30991500" },
      data: { searchText: "" },
    });

    const res = await service().searchHierarchical("paslanmaz");

    const classes = res.segments.flatMap((s) =>
      s.families.flatMap((f) => f.classes),
    );
    expect(classes.map((c) => c.nameTr)).toContain("Paslanmaz sac");
  });

  it("2 karakterden kısa sorgu boş döner", async () => {
    const res = await service().searchHierarchical("a");
    expect(res.segments).toEqual([]);
  });
});

describe("foldSearchText", () => {
  it("TR harfleri ve şapkalıları ASCII'ye katlar", () => {
    expect(foldSearchText("İskele ÇĞÜŞÖI ı kâğıt")).toBe(
      "iskele cgusoi i kagit",
    );
  });
  it("boşlukları tekilleştirir", () => {
    expect(foldSearchText("  çelik   konstrüksiyon  ")).toBe(
      "celik konstruksiyon",
    );
  });
});
