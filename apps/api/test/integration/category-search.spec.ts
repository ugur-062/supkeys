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
  sortOrder?: number;
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
      sortOrder: opts.sortOrder ?? 0,
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

/**
 * KÜRASYON DÖNGÜSÜ (Faz 6, 2026-09-01).
 *
 * Sonuçsuz aramalar, taksonominin nerede eksik olduğunu söyleyen tek doğrudan
 * sinyaldir — kullanıcı bir şey arıyor ve bulamıyor. Bu bilgi eskiden yalnız
 * API loguna düşüp log döngüsüyle kayboluyordu; artık sayaçlı bir kuyrukta
 * birikiyor.
 */
describe("CategoryService.searchTree — sonuçsuz arama kaydı", () => {
  it("sonuç bulunamayan arama kuyruğa yazılır", async () => {
    await makeChain({ seg: "Metal", fam: "Çelik", cls: "Paslanmaz sac" });

    await service().searchHierarchical("abkant büküm");

    const row = await prisma.categorySearchMiss.findUnique({
      where: { query: "abkant bukum" },
    });
    expect(row?.count).toBe(1);
    expect(row?.rawQuery).toBe("abkant büküm");
    expect(row?.resolvedAt).toBeNull();
  });

  it("aynı arama farklı yazımla gelse TEK satırda sayılır", async () => {
    await makeChain({ seg: "Metal", fam: "Çelik", cls: "Paslanmaz sac" });

    // Katlanmış biçim aynı: "Abkant" / "ABKANT" / "abkant".
    await service().searchHierarchical("Abkant");
    await service().searchHierarchical("ABKANT");
    await service().searchHierarchical("abkant");

    const rows = await prisma.categorySearchMiss.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(3);
  });

  it("SONUÇ BULUNAN arama kuyruğa YAZILMAZ", async () => {
    await makeChain({ seg: "Metal", fam: "Çelik", cls: "Paslanmaz sac" });

    await service().searchHierarchical("paslanmaz");

    expect(await prisma.categorySearchMiss.count()).toBe(0);
  });

  it("çözülmüş terim yeniden aranırsa kuyruğa GERİ ALINIR", async () => {
    await makeChain({ seg: "Metal", fam: "Çelik", cls: "Paslanmaz sac" });

    await service().searchHierarchical("caraskal");
    await prisma.categorySearchMiss.update({
      where: { query: "caraskal" },
      data: { resolvedAt: new Date(), resolvedNote: "eşanlamlı eklendi" },
    });

    // Hâlâ bulunamıyor → çözüm tutmamış.
    await service().searchHierarchical("caraskal");

    const row = await prisma.categorySearchMiss.findUnique({
      where: { query: "caraskal" },
    });
    expect(row?.resolvedAt).toBeNull();
    expect(row?.count).toBe(2);
  });

  it("aşırı uzun sorgu kuyruğu şişirmez", async () => {
    await makeChain({ seg: "Metal", fam: "Çelik", cls: "Paslanmaz sac" });

    await service().searchHierarchical("x".repeat(120));

    expect(await prisma.categorySearchMiss.count()).toBe(0);
  });
});

/**
 * KIRPMA SIRASI (2026-09-01).
 *
 * 200 sonuç tavanı katalog küçükken neredeyse hiç devreye girmiyordu. Katalog
 * 10.991 kategoriye ve eşanlamlı sözlüğü 61k kelimeye çıkınca geniş sorgular
 * tavana dayanmaya başladı — ölçüm: "makine" 92 sınıf + 474 emtia eşleştiriyor.
 * Emtia-önce sıralamada ilk 200'e giren SINIF sayısı sıfırdı: kullanıcı 200
 * tekil ürün görüyor, gezinebileceği hiçbir üst başlık göremiyordu.
 */
describe("CategoryService.searchTree — kırpmada sınıf önceliği", () => {
  it("tavan aşılınca SINIF (L3) sonuçları emtiaya (L4) feda edilmez", async () => {
    await makeCategory({ code: "30000000", nameTr: "Makine", level: 1 });
    await makeCategory({
      code: "30990000",
      nameTr: "Genel makineler",
      level: 2,
      parentId: "30000000",
    });
    // 3 sınıf × 80 emtia = 243 eşleşme → 200 tavanı aşılır.
    // (Bir sınıfın altına en fazla 99 emtia sığar: kodun son 2 hanesi.)
    for (let c = 0; c < 3; c++) {
      const clsCode = `3099${15 + c}00`;
      await makeCategory({
        code: clsCode,
        nameTr: `Tezgah grubu ${c}`,
        level: 3,
        parentId: "30990000",
      });
      for (let i = 1; i <= 80; i++) {
        await makeCategory({
          code: `${clsCode.slice(0, 6)}${String(i).padStart(2, "0")}`,
          nameTr: `Tezgah modeli ${c}-${i}`,
          level: 4,
          parentId: clsCode,
        });
      }
    }

    const res = await service().searchHierarchical("tezgah");

    expect(res.truncated).toBe(true);
    const classes = res.segments.flatMap((s) =>
      s.families.flatMap((f) => f.classes),
    );
    // Emtia seli sınıfları kırpmanın dışına itmedi: üçü de EŞLEŞME olarak
    // ağaçta. level:desc sıralamasında ilk 200'ün tamamı emtia olurdu ve
    // kullanıcı gezinebileceği tek bir üst başlık göremezdi.
    const matched = classes.filter((c) => c.isMatch).map((c) => c.nameTr);
    expect(matched).toEqual(
      expect.arrayContaining([
        "Tezgah grubu 0",
        "Tezgah grubu 1",
        "Tezgah grubu 2",
      ]),
    );
  });
});

/**
 * ARAYÜZ TESTİ api1-03.
 *  - O-022: sonuçlar ALAKA sırasıyla; 200 tavanı puan sırasından SONRA.
 *  - O-048: yalnız rakamdan oluşan sorgu kod önekiyle eşleşir, kürasyon
 *    kuyruğuna yazılmaz.
 */
describe("CategoryService.searchTree — alaka sırası (O-022)", () => {
  const flatClasses = (res: Awaited<ReturnType<CategoryService["searchHierarchical"]>>) =>
    res.segments.flatMap((s) => s.families.flatMap((f) => f.classes));

  it("adında geçen kategori, yalnız eş anlamlıdan gelenin ÖNÜNDE (segment sırası da)", async () => {
    // Katalog sırasında kimyasallar ÖNCE gelir — eski düzende "Silikon gres" ilk sıradaydı.
    await makeCategory({ code: "12000000", nameTr: "Kimyasallar", level: 1, sortOrder: 0 });
    await makeCategory({ code: "12170000", nameTr: "Yağlayıcılar", level: 2, parentId: "12000000" });
    await makeCategory({
      code: "12171500",
      nameTr: "Silikon gres",
      level: 3,
      parentId: "12170000",
      keywords: "rulman gresi",
    });
    await makeCategory({ code: "31000000", nameTr: "Üretim bileşenleri", level: 1, sortOrder: 5 });
    await makeCategory({ code: "31170000", nameTr: "Mekanik aktarım", level: 2, parentId: "31000000" });
    await makeCategory({
      code: "31171500",
      nameTr: "Rulmanlar ve yataklar",
      level: 3,
      parentId: "31170000",
    });

    const res = await service().searchHierarchical("rulman");

    expect(res.segments.map((s) => s.code)).toEqual(["31000000", "12000000"]);
    expect(flatClasses(res).map((c) => c.nameTr)).toEqual([
      "Rulmanlar ve yataklar",
      "Silikon gres",
    ]);
  });

  it("tavan aşılınca alakasız eş anlamlı seli adında geçeni KESMEZ; 'Vanalar' > 'Vanadyum'", async () => {
    await makeCategory({ code: "40000000", nameTr: "Akış sistemleri", level: 1 });
    await makeCategory({ code: "40140000", nameTr: "Akış kontrolü", level: 2, parentId: "40000000" });
    const rows: Parameters<typeof prisma.category.createMany>[0]["data"] = [];
    for (let c = 0; c < 3; c++) {
      const cls = `40141${6 + c}00`;
      await makeCategory({ code: cls, nameTr: `Bağlantı grubu ${c}`, level: 3, parentId: "40140000" });
      for (let i = 1; i <= 75; i++) {
        const code = `${cls.slice(0, 6)}${String(i).padStart(2, "0")}`;
        (rows as object[]).push({
          id: code,
          code,
          nameTr: `Parça ${c}-${i}`,
          keywords: "vana",
          searchText: foldSearchText(`Parça ${c}-${i} vana`),
          level: 4,
          parentId: cls,
          isActive: true,
          sortOrder: i,
        });
      }
    }
    await prisma.category.createMany({ data: rows });
    // Katalog sırasında EN SONDA: eski düzende 200'ün dışında kalırdı.
    await makeCategory({ code: "40141899", nameTr: "Vanadyum", level: 4, parentId: "40141800", sortOrder: 998 });
    await makeCategory({ code: "40141898", nameTr: "Vanalar", level: 4, parentId: "40141800", sortOrder: 999 });

    const res = await service().searchHierarchical("vana");

    expect(res.truncated).toBe(true);
    const cls = flatClasses(res);
    // En iyi çocuğu "Vanalar" olan sınıf en üstte, içinde Vanalar > Vanadyum.
    expect(cls[0]!.code).toBe("40141800");
    expect(cls[0]!.commodities.slice(0, 2).map((c) => c.nameTr)).toEqual(["Vanalar", "Vanadyum"]);
  });
});

/**
 * Yeniden doğrulama (O-022): en iyi tek puan çok sık eşitleniyordu ve eşitlik
 * KOD sırasına düşüyordu — "kablo"da Madencilik (20…) Elektrik kablosunun
 * (26…) önünde, "rulman"da tek ad eşleşmeli segmentin eş anlamlı kardeşleri
 * "Rulmanlar ve yataklar"ın önündeydi.
 */
describe("CategoryService.searchTree — segment/sınıf ağırlığı (O-022 yeniden doğrulama)", () => {
  it("adı eşleşen satırı ÇOK olan segment, kodda önce gelen tek eşleşmeli segmentin önünde", async () => {
    // Segment 20: tek "Kablo saplayıcılar" + yalnız eş anlamlıdan gelen kardeş.
    await makeCategory({ code: "20000000", nameTr: "Madencilik makineleri", level: 1, sortOrder: 0 });
    await makeCategory({ code: "20100000", nameTr: "Madencilik ekipmanı", level: 2, parentId: "20000000", sortOrder: 0 });
    await makeCategory({ code: "20101800", nameTr: "Tahkimat sistemleri", level: 3, parentId: "20100000", sortOrder: 0 });
    await makeCategory({ code: "20101801", nameTr: "Kablo saplayıcılar", level: 4, parentId: "20101800", sortOrder: 0 });
    await makeCategory({ code: "20101802", nameTr: "Tavan direkleri", level: 4, parentId: "20101800", sortOrder: 1, keywords: "kablo" });
    // Segment 26: "Kablo tesisatı" sınıfı (kendi adı) + çok "… kablosu" emtiası.
    await makeCategory({ code: "26000000", nameTr: "Güç dağıtımı", level: 1, sortOrder: 5 });
    await makeCategory({ code: "26120000", nameTr: "Elektrik teli ve kablosu", level: 2, parentId: "26000000", sortOrder: 0 });
    await makeCategory({ code: "26121600", nameTr: "Elektrik kablosu ve aksesuarları", level: 3, parentId: "26120000", sortOrder: 0 });
    for (const [i, n] of ["Kablo aksesuarları", "Kontrol kablosu", "Sinyal kablosu", "Ağ kablosu"].entries()) {
      await makeCategory({ code: `2612160${i + 1}`, nameTr: n, level: 4, parentId: "26121600", sortOrder: i });
    }
    await makeCategory({ code: "26121700", nameTr: "Kablo tesisatı", level: 3, parentId: "26120000", sortOrder: 1 });

    const res = await service().searchHierarchical("kablo");

    expect(res.segments.map((s) => s.code)).toEqual(["26000000", "20000000"]);
    // Sınıfta önce KENDİ adı: "Kablo tesisatı" yüz emtialı sınıfın altında gömülmez.
    expect(res.segments[0]!.families[0]!.classes.map((c) => c.code)).toEqual([
      "26121700",
      "26121600",
    ]);
    // Yalnız eş anlamlıdan gelen kardeş kendi sınıfında ad eşleşmesinin ARKASINDA.
    expect(res.segments[1]!.families[0]!.classes[0]!.commodities.map((c) => c.code)).toEqual([
      "20101801",
      "20101802",
    ]);
  });

  it("aynı segmentte ad eşleşmeli aile, yalnız eş anlamlı aileden önce", async () => {
    await makeCategory({ code: "27000000", nameTr: "Aletler", level: 1 });
    await makeCategory({ code: "27110000", nameTr: "El aletleri", level: 2, parentId: "27000000", sortOrder: 0 });
    await makeCategory({ code: "27113100", nameTr: "Çekme aletleri", level: 3, parentId: "27110000", keywords: "rulman" });
    await makeCategory({ code: "27120000", nameTr: "Yatak aletleri", level: 2, parentId: "27000000", sortOrder: 1 });
    await makeCategory({ code: "27121500", nameTr: "Rulman presleri", level: 3, parentId: "27120000" });

    const res = await service().searchHierarchical("rulman");

    expect(res.segments[0]!.families.map((f) => f.code)).toEqual(["27120000", "27110000"]);
  });
});

describe("CategoryService.searchTree — kodla arama (O-048)", () => {
  async function chain31() {
    await makeCategory({ code: "31000000", nameTr: "Üretim bileşenleri", level: 1 });
    await makeCategory({ code: "31160000", nameTr: "Donanım", level: 2, parentId: "31000000" });
    await makeCategory({ code: "31161600", nameTr: "Vidalar", level: 3, parentId: "31160000" });
    await makeCategory({ code: "31161603", nameTr: "Ağaç vidaları", level: 4, parentId: "31161600" });
  }

  it("8 haneli emtia kodu tam eşleşir", async () => {
    await chain31();
    const res = await service().searchHierarchical("31161603");
    const cls = res.segments.flatMap((s) => s.families.flatMap((f) => f.classes));
    expect(cls[0]!.commodities.map((c) => [c.code, c.isMatch])).toEqual([["31161603", true]]);
  });

  it("sınıf kodu (sondaki 00 düşülür) ve kısa önek de bulur", async () => {
    await chain31();
    for (const q of ["31161600", "311616", "3116"]) {
      const res = await service().searchHierarchical(q);
      const cls = res.segments.flatMap((s) => s.families.flatMap((f) => f.classes));
      expect(cls.find((c) => c.code === "31161600")?.isMatch).toBe(true);
    }
  });

  it("gizli segmentteki kod: sonuç yok + hiddenSegment (admin nedenini söyler)", async () => {
    await makeCategory({ code: "43000000", nameTr: "Bilişim", level: 1 });
    await makeCategory({ code: "43230000", nameTr: "Yazılım", level: 2, parentId: "43000000" });
    await makeCategory({ code: "43231500", nameTr: "İş yazılımları", level: 3, parentId: "43230000" });
    const res = await service().searchHierarchical("43230000");
    expect(res).toEqual({ segments: [], truncated: false, hiddenSegment: "43" });
    expect(await prisma.categorySearchMiss.count()).toBe(0);
    // Görünür segmentte sonuçsuz kod: hiddenSegment YOK.
    expect((await service().searchHierarchical("99990000")).hiddenSegment).toBeUndefined();
  });

  it("ondalık ölçü ('2.5') kod öneki sayılmaz — segment 25 dönmez (NEW-1)", async () => {
    await makeCategory({ code: "25000000", nameTr: "Araçlar", level: 1 });
    await makeCategory({ code: "25100000", nameTr: "Motorlu taşıtlar", level: 2, parentId: "25000000" });
    await makeCategory({ code: "25101500", nameTr: "Binek araçlar", level: 3, parentId: "25100000" });
    expect((await service().searchHierarchical("2.5")).segments).toEqual([]);
    expect((await service().searchHierarchical("25")).segments.map((s) => s.code)).toEqual(["25000000"]);
  });

  it("sonuçsuz kod araması kürasyon kuyruğuna YAZILMAZ", async () => {
    await chain31();
    const res = await service().searchHierarchical("99990000");
    expect(res.segments).toEqual([]);
    expect(await prisma.categorySearchMiss.count()).toBe(0);
  });
});
