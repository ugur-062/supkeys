/**
 * Kategori arama — TR-katlanmış searchText yolu (searchTree).
 *
 * Kök neden: Postgres lower('İ') = "i + combining dot" olduğundan ham ILIKE
 * '%iskele%' "İskele sistemleri"ni BULAMIYORDU; aksansız yazım ("jenerator")
 * da eşleşmiyordu. Bu spec, fold edilen sorgu + searchText kolonunun bu iki
 * sınıfı da yakaladığının sözleşmesidir.
 */
import { foldSearchText, tokenizeQuery } from "@rothern/shared";
import { CategoryService } from "../../src/modules/categories/services/category.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";

const service = () => new CategoryService(prisma as unknown as PrismaService);

async function makeCategory(opts: {
  code: string;
  nameTr: string;
  level: number;
  parentId?: string | null;
  keywords?: string;
}) {
  // searchText kurulumu seed/apply-category-keywords ile birebir aynı:
  // fold(nameTr + " " + keywords).
  return prisma.category.create({
    data: {
      id: opts.code,
      code: opts.code,
      nameTr: opts.nameTr,
      keywords: opts.keywords ?? "",
      searchText: foldSearchText(`${opts.nameTr} ${opts.keywords ?? ""}`),
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

  it("eşanlamlı (keywords) sorgusu kategori adında geçmese de bulur", async () => {
    await makeCategory({ code: "22000000", nameTr: "İnşaat makineleri", level: 1 });
    await makeCategory({
      code: "22990000",
      nameTr: "Şantiye ekipmanları",
      level: 2,
      parentId: "22000000",
    });
    await makeCategory({
      code: "22991700",
      nameTr: "Vinç ve kaldırma platformları",
      level: 3,
      parentId: "22990000",
      keywords: "telfer caraskal manlift",
    });

    const res = await service().searchHierarchical("telfer");

    const classes = res.segments.flatMap((s) =>
      s.families.flatMap((f) => f.classes),
    );
    expect(classes.map((c) => c.nameTr)).toContain(
      "Vinç ve kaldırma platformları",
    );
  });

  it("2 karakterden kısa sorgu boş döner", async () => {
    const res = await service().searchHierarchical("a");
    expect(res.segments).toEqual([]);
  });
});

describe("tokenizeQuery", () => {
  it("boşluk, virgül ve eğik çizgiyle böler", () => {
    expect(tokenizeQuery("paslanmaz sac, levha/plaka")).toEqual([
      "paslanmaz",
      "sac",
      "levha",
      "plaka",
    ]);
  });
  it("bağlaçları ve tek harfi atar", () => {
    expect(tokenizeQuery("vinç ve caraskal a")).toEqual(["vinç", "caraskal"]);
  });
  it("bağlacı KATLANMIŞ biçimde tanır ('İLE' → 'ile')", () => {
    expect(tokenizeQuery("boru İLE fitting")).toEqual(["boru", "fitting"]);
  });
  it("ham kelimeyi döndürür (katlamaz) — nameTr yedeği için", () => {
    expect(tokenizeQuery("Jeneratör kabini")).toEqual(["Jeneratör", "kabini"]);
  });
  it("yalnız bağlaç varsa boş döner (çağıran bütün ifadeye düşer)", () => {
    expect(tokenizeQuery("ve ile")).toEqual([]);
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

/**
 * TOKENLİ arama sözleşmesi (Faz 1, 2026-09-01).
 *
 * Kök neden: sorgu TEK PARÇA aranıyordu — `searchText contains "paslanmaz sac"`.
 * Kullanıcı kelimeleri kategori adındaki sırayla yazmadığında ya da ad ile
 * eşanlamlıyı karıştırdığında hiçbir şey bulunmuyordu. Ölçüm (canlı, 8.149
 * düğüm): 8 gerçekçi endüstriyel sorgunun 7'si 0 sonuç döndürüyordu.
 *
 * Yeni sözleşme: sorgu kelimelere bölünür ve AND'lenir — her kelime bir yerde
 * geçmeli, SIRASI önemsiz; kelimeler ad ile eşanlamlı sözlüğüne DAĞILABİLİR.
 */
describe("CategoryService.searchTree — tokenli arama", () => {
  const classesOf = (res: Awaited<ReturnType<CategoryService["searchHierarchical"]>>) =>
    res.segments.flatMap((s) => s.families.flatMap((f) => f.classes)).map((c) => c.nameTr);

  it("kelime SIRASI tutmasa da bulur", async () => {
    await makeChain({
      seg: "Metal",
      fam: "Çelik ürünler",
      cls: "Sac ve paslanmaz yassı mamul",
    });

    // Ad "Sac ve paslanmaz..." — kullanıcı ters yazıyor.
    expect(classesOf(await service().searchHierarchical("paslanmaz sac"))).toContain(
      "Sac ve paslanmaz yassı mamul",
    );
  });

  it("bir kelime ADDAN, diğeri EŞANLAMLIDAN gelse de bulur", async () => {
    await makeCategory({ code: "11000000", nameTr: "Hammadde", level: 1 });
    await makeCategory({
      code: "11990000",
      nameTr: "Metal yarı mamul",
      level: 2,
      parentId: "11000000",
    });
    await makeCategory({
      code: "11991500",
      nameTr: "Paslanmaz çelik ürünler",
      level: 3,
      parentId: "11990000",
      keywords: "inox aisi 304 316 levha",
    });

    // "paslanmaz" adda, "304" yalnız eşanlamlıda — tek parça arama bunu bulamazdı.
    expect(
      classesOf(await service().searchHierarchical("paslanmaz 304")),
    ).toContain("Paslanmaz çelik ürünler");
  });

  it("bağlaç ('ve') sonucu daraltmaz", async () => {
    await makeCategory({ code: "22000000", nameTr: "İnşaat makineleri", level: 1 });
    await makeCategory({
      code: "22990000",
      nameTr: "Şantiye ekipmanları",
      level: 2,
      parentId: "22000000",
    });
    await makeCategory({
      code: "22991700",
      nameTr: "Kaldırma platformları",
      level: 3,
      parentId: "22990000",
      keywords: "vinç caraskal telfer",
    });

    // "ve" hiçbir kategoride geçmez; AND'lenirse sorgu 0 döndürürdü.
    expect(
      classesOf(await service().searchHierarchical("vinç ve caraskal")),
    ).toContain("Kaldırma platformları");
  });

  it("kelimelerden biri hiç geçmiyorsa sonuç DÖNMEZ (AND anlamı)", async () => {
    await makeChain({
      seg: "Metal",
      fam: "Çelik ürünler",
      cls: "Paslanmaz sac",
    });

    // "paslanmaz" var, "hidrolik" yok → kesişim boş.
    const res = await service().searchHierarchical("paslanmaz hidrolik");
    expect(res.segments).toEqual([]);
  });

  it("tek kelimeli sorguda eski davranış korunur", async () => {
    await makeChain({
      seg: "Enerji ekipmanları",
      fam: "Güç kaynakları",
      cls: "Jeneratörler",
    });

    expect(classesOf(await service().searchHierarchical("jenerator"))).toContain(
      "Jeneratörler",
    );
  });
});
