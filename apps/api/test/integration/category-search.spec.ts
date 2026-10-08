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
  nameEn?: string;
  nameRu?: string;
}) {
  // searchText kurulumu seed/apply-category-keywords ile birebir aynı:
  // fold(nameTr + " " + keywords [+ EN ad] [+ RU ad]).
  return prisma.category.create({
    data: {
      id: opts.code,
      code: opts.code,
      nameTr: opts.nameTr,
      nameEn: opts.nameEn ?? null,
      nameRu: opts.nameRu ?? null,
      keywords: opts.keywords ?? "",
      searchText: foldSearchText(
        `${opts.nameTr} ${opts.keywords ?? ""} ${opts.nameEn ?? ""} ${opts.nameRu ?? ""}`,
      ),
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

/**
 * EK TOLERANSI (code-category-2). Kelimeler düz alt dize olarak aranıyordu:
 * "çelik boru" 112 sonuç, "çelik boruları" 0; "kablo" 200, "kablolar" 18.
 * Süzgeç artık kelimenin KÖKÜYLE arar (shared `stemPrefix`, ürün aramasıyla
 * aynı kural); yazılan biçimi taşıyan satır yine önde kalır.
 */
describe("CategoryService.searchTree — Türkçe ek ve İngilizce çoğul toleransı (code-category-2)", () => {
  const flatClasses = (res: Awaited<ReturnType<CategoryService["searchHierarchical"]>>) =>
    res.segments.flatMap((s) => s.families.flatMap((f) => f.classes));

  async function pipes() {
    await makeCategory({ code: "30000000", nameTr: "Metal mamuller", level: 1 });
    await makeCategory({ code: "30990000", nameTr: "Yapı elemanları", level: 2, parentId: "30000000" });
    await makeCategory({ code: "30991500", nameTr: "Çelik boru", level: 3, parentId: "30990000", nameEn: "Steel pipe" });
    await makeCategory({ code: "30991600", nameTr: "Dikişsiz çelik boruları", level: 3, parentId: "30990000" });
    await makeCategory({ code: "30991700", nameTr: "Bakır levha", level: 3, parentId: "30990000" });
  }

  it("çekimli sorgu yalın adı da bulur: 'çelik boruları' = 'çelik boru'", async () => {
    await pipes();

    const yalin = flatClasses(await service().searchHierarchical("çelik boru"));
    const cekimli = flatClasses(await service().searchHierarchical("çelik boruları"));

    const eslesen = (cls: typeof yalin) => cls.filter((c) => c.isMatch).map((c) => c.code).sort();
    expect(eslesen(cekimli)).toEqual(["30991500", "30991600"]);
    expect(eslesen(cekimli)).toEqual(eslesen(yalin));
    // Bulunan sorgu kürasyon kuyruğuna "sonuçsuz" diye yazılmaz.
    expect(await prisma.categorySearchMiss.count()).toBe(0);
  });

  it("yazılan sözcüğü taşıyan ad, yalnız kökle eşleşenin; o da yalnız eş anlamlıdan gelenin önünde", async () => {
    await makeCategory({ code: "26000000", nameTr: "Güç dağıtımı", level: 1 });
    await makeCategory({ code: "26120000", nameTr: "İletkenler", level: 2, parentId: "26000000" });
    // Katalog sırası bilerek TERS: eski düzende eş anlamlı satır en üstteydi.
    await makeCategory({ code: "26121500", nameTr: "Bağlantı elemanları", level: 3, parentId: "26120000", sortOrder: 0, keywords: "kablo" });
    await makeCategory({ code: "26121600", nameTr: "Kablo tesisatı", level: 3, parentId: "26120000", sortOrder: 1 });
    await makeCategory({ code: "26121700", nameTr: "Elektrik kabloları", level: 3, parentId: "26120000", sortOrder: 2 });
    await makeCategory({ code: "26121800", nameTr: "Kablolar", level: 3, parentId: "26120000", sortOrder: 3 });

    const res = await service().searchHierarchical("kablolar");

    expect(flatClasses(res).map((c) => c.nameTr)).toEqual([
      "Kablolar",
      "Elektrik kabloları",
      "Kablo tesisatı",
      "Bağlantı elemanları",
    ]);
  });

  it("İngilizce çoğul: 'steel pipes' EN adı 'Steel pipe' olan kategoriyi bulur", async () => {
    await pipes();

    const cls = flatClasses(await service().searchHierarchical("steel pipes"));

    expect(cls.filter((c) => c.isMatch).map((c) => c.code)).toEqual(["30991500"]);
  });

  it("searchText'i boş (legacy) satırda nameTr yedeği de kökle arar", async () => {
    await makeChain({ seg: "Metal", fam: "Yapı elemanları", cls: "Paslanmaz borular" });
    await prisma.category.update({ where: { id: "30991500" }, data: { searchText: "" } });

    const cls = flatClasses(await service().searchHierarchical("paslanmaz boruları"));

    expect(cls.map((c) => c.nameTr)).toContain("Paslanmaz borular");
  });

  it("kökle de bulunamayan çekimli sorgu kuyruğa YAZILIR (yazıldığı biçimle)", async () => {
    await pipes();

    const res = await service().searchHierarchical("abkant bükümleri");

    expect(res.segments).toEqual([]);
    const row = await prisma.categorySearchMiss.findUnique({ where: { query: "abkant bukumleri" } });
    expect(row?.count).toBe(1);
  });
});

/**
 * YAZILAN KELİME BİRİNCİL (cat-search-stem-displaces-typed-word,
 * cat-search-short-english-stem). Süzgeç yalnız kökle arıyordu ve kök başka
 * sözcüklerin içinde de geçiyordu ("nakliye" → "nakli" ⊂ "kaynaklı"): yalnız
 * kökle gelen satırlar 200 tavanını dolduruyor, yazılan kelimeyi taşıyan
 * satırlar kesiliyor ya da arkaya düşüyordu. Kural: yazılan kelimeyi taşıyan
 * satırlar ayrı çekilir, hep önde durur ve tavan onları kesmez; yalnız kökle
 * gelenler kalan yeri doldurur. 4 karakterden kısa kök hiç kullanılmaz.
 */
describe("CategoryService.searchTree — yazılan kelime birincil, kök kalan yeri doldurur", () => {
  type Tree = Awaited<ReturnType<CategoryService["searchHierarchical"]>>;
  const flatClasses = (res: Tree) => res.segments.flatMap((s) => s.families.flatMap((f) => f.classes));
  /** Ağaçtaki EŞLEŞEN satırların (L3 + L4) kodları, ağaç sırasıyla. */
  const matchedCodes = (res: Tree) =>
    flatClasses(res).flatMap((c) => [
      ...(c.isMatch ? [c.code] : []),
      ...c.commodities.filter((x) => x.isMatch).map((x) => x.code),
    ]);

  it("'nakliye': kök 'nakli' yalnız SÖZCÜK BAŞINDA aranır — 240 '… kaynaklı …' satırı sonuca girmez, çekimli biçim ('nakliyat') yazılan kelimenin arkasında gelir", async () => {
    // Segment 31 katalogda ÖNCE: 240 emtia kökü yalnız bir sözcüğün İÇİNDE
    // taşır ("kayNAKLIı"). Kök düz alt dizgiyken bunlar tavanı dolduruyordu.
    await makeCategory({ code: "31000000", nameTr: "Üretim bileşenleri", level: 1, sortOrder: 0 });
    await makeCategory({ code: "31230000", nameTr: "Boru düzenekleri", level: 2, parentId: "31000000" });
    const rows: object[] = [];
    for (let c = 0; c < 3; c++) {
      const cls = `31231${5 + c}00`;
      await makeCategory({ code: cls, nameTr: `Düzenek grubu ${c}`, level: 3, parentId: "31230000", sortOrder: c });
      for (let i = 1; i <= 80; i++) {
        const code = `${cls.slice(0, 6)}${String(i).padStart(2, "0")}`;
        const nameTr = `Solvent kaynaklı boru düzeneği ${c}-${i}`;
        rows.push({ id: code, code, nameTr, keywords: "", searchText: foldSearchText(nameTr), level: 4, parentId: cls, isActive: true, sortOrder: i });
      }
    }
    await prisma.category.createMany({ data: rows as Parameters<typeof prisma.category.createMany>[0]["data"] });
    // Yazılan kelime ADINDA: tek sınıf. Yanında kökün ÇEKİMİ (sözcük başı):
    // "Nakliyat …" ve noktalamadan sonra başlayan "(nakliyeci)".
    await makeCategory({ code: "24000000", nameTr: "Malzeme taşıma", level: 1, sortOrder: 5 });
    await makeCategory({ code: "24110000", nameTr: "Kaplar ve depolama", level: 2, parentId: "24000000" });
    await makeCategory({ code: "24112400", nameTr: "Nakliye kasaları", level: 3, parentId: "24110000", sortOrder: 1 });
    await makeCategory({ code: "24112500", nameTr: "Nakliyat sandıkları", level: 3, parentId: "24110000", sortOrder: 0 });
    await makeCategory({ code: "24112600", nameTr: "Taşıma kayışları (nakliyat)", level: 3, parentId: "24110000", sortOrder: 2 });
    // Yazılan kelime yalnız EŞ ANLAMLIDA.
    await makeCategory({ code: "78000000", nameTr: "Taşımacılık hizmetleri", level: 1, sortOrder: 9 });
    await makeCategory({ code: "78100000", nameTr: "Posta ve kargo taşımacılığı", level: 2, parentId: "78000000" });
    await makeCategory({ code: "78101800", nameTr: "Karayolu kargo taşımacılığı", level: 3, parentId: "78100000", keywords: "nakliye nakliyat" });
    await makeCategory({ code: "78101801", nameTr: "Yerel kamyon taşıma hizmetleri", level: 4, parentId: "78101800", keywords: "şehir içi nakliye" });
    await makeCategory({ code: "78101900", nameTr: "Lojistik", level: 3, parentId: "78100000", keywords: "nakliye" });

    const res = await service().searchHierarchical("nakliye");

    const matched = matchedCodes(res);
    // Yazılan kelimeyi taşıyan dört satırın HEPSİ ağaçta.
    expect(matched).toEqual(expect.arrayContaining(["24112400", "78101800", "78101801", "78101900"]));
    // Kökü sözcük BAŞINDA taşıyan iki çekimli satır dolgu olarak gelir …
    expect(matched).toEqual(expect.arrayContaining(["24112500", "24112600"]));
    // … kökü sözcüğün İÇİNDE taşıyan 240 satırın hiçbiri gelmez.
    expect(matched.filter((c) => c.startsWith("3123"))).toHaveLength(0);
    expect(matched).toHaveLength(6);
    expect(res.truncated).toBe(false);
    expect(res.segments.map((s) => s.code)).toEqual(["24000000", "78000000"]);
    // Aynı ailede yazılan kelimeyi taşıyan sınıf, katalog sırası önde olsa da çekimli olanın önünde.
    const fam = res.segments[0]!.families[0]!.classes.map((c) => c.code);
    expect(fam[0]).toBe("24112400");
    expect(await prisma.categorySearchMiss.count()).toBe(0);
  });

  it("'mobilya': 'Mobil …' satırları (kök 'mobil') 'Mobilya cilaları'nın ve eş anlamlıdan gelenin önüne geçemez", async () => {
    // Katalogda ÖNCE gelen segment: üç sınıf yalnız kökle eşleşir; toplam
    // ağırlıkları (3 × 2,75²) tek "Mobilya cilaları"nınkini (4²) geçiyordu.
    await makeCategory({ code: "25000000", nameTr: "Araçlar", level: 1, sortOrder: 0 });
    await makeCategory({ code: "25100000", nameTr: "Motorlu taşıtlar", level: 2, parentId: "25000000" });
    await makeCategory({ code: "25101600", nameTr: "Mobil medya aracı", level: 3, parentId: "25100000", sortOrder: 0 });
    await makeCategory({ code: "25101700", nameTr: "Mobil ofis aracı", level: 3, parentId: "25100000", sortOrder: 1 });
    await makeCategory({ code: "25101800", nameTr: "Mobil atölye aracı", level: 3, parentId: "25100000", sortOrder: 2 });
    await makeCategory({ code: "30000000", nameTr: "Yapı malzemeleri", level: 1, sortOrder: 5 });
    await makeCategory({ code: "30160000", nameTr: "İç mekân ürünleri", level: 2, parentId: "30000000" });
    await makeCategory({ code: "30161700", nameTr: "Büro donanımı", level: 3, parentId: "30160000", keywords: "mobilya" });
    await makeCategory({ code: "31000000", nameTr: "Üretim bileşenleri", level: 1, sortOrder: 9 });
    await makeCategory({ code: "31210000", nameTr: "Boyalar ve astarlar", level: 2, parentId: "31000000" });
    await makeCategory({ code: "31211900", nameTr: "Mobilya cilaları", level: 3, parentId: "31210000" });

    const res = await service().searchHierarchical("mobilya");

    expect(res.segments.map((s) => s.code)).toEqual(["31000000", "30000000", "25000000"]);
    expect(flatClasses(res).map((c) => c.nameTr)).toEqual([
      "Mobilya cilaları",
      "Büro donanımı",
      "Mobil medya aracı",
      "Mobil ofis aracı",
      "Mobil atölye aracı",
    ]);
    expect(res.truncated).toBe(false);
  });

  it("'cıvata': aynı aile ve aynı sınıf içinde de yalnız kökle ('civa') gelen satır yazılan kelimeyi taşıyanın arkasında", async () => {
    await makeCategory({ code: "31000000", nameTr: "Üretim bileşenleri", level: 1 });
    await makeCategory({ code: "31160000", nameTr: "Donanım", level: 2, parentId: "31000000" });
    // Katalog sırası bilerek TERS.
    await makeCategory({ code: "31161500", nameTr: "Cıva buharlı lambalar", level: 3, parentId: "31160000", sortOrder: 0 });
    await makeCategory({ code: "31161600", nameTr: "Somunlar ve pullar", level: 3, parentId: "31160000", sortOrder: 1, keywords: "cıvata" });
    await makeCategory({ code: "31161601", nameTr: "Cıva tuzu", level: 4, parentId: "31161600", sortOrder: 0 });
    await makeCategory({ code: "31161602", nameTr: "Altıgen somun", level: 4, parentId: "31161600", sortOrder: 1, keywords: "cıvata" });
    await makeCategory({ code: "31161603", nameTr: "Saplama cıvata", level: 4, parentId: "31161600", sortOrder: 2 });
    await makeCategory({ code: "31161700", nameTr: "Cıvatalar", level: 3, parentId: "31160000", sortOrder: 2 });

    const res = await service().searchHierarchical("cıvata");

    const cls = flatClasses(res);
    // Sınıf: ad eşleşmesi > yalnız eş anlamlı (yazılan kelime) > yalnız kök.
    expect(cls.map((c) => c.nameTr)).toEqual(["Cıvatalar", "Somunlar ve pullar", "Cıva buharlı lambalar"]);
    // Emtia: yalnız kökle gelen "Cıva tuzu" (2,75) eş anlamlıdan gelen
    // "Altıgen somun"un (0) önüne geçemez.
    expect(cls[1]!.commodities.map((c) => c.nameTr)).toEqual(["Saplama cıvata", "Altıgen somun", "Cıva tuzu"]);
    // Yalnız kökle gelen satır da EŞLEŞMEDİR (vurgu + seçilebilir).
    expect(cls[2]!.isMatch).toBe(true);
  });

  it("'kaplin': kök 'kapl' ile eşleşen 21 aile 20'lik aile tavanını doldursa da adı yazılan kelimeyi taşıyan aile düşmez", async () => {
    await makeCategory({ code: "30000000", nameTr: "Yapı malzemeleri", level: 1, sortOrder: 0 });
    for (let i = 0; i <= 20; i++) {
      const fam = `30${10 + i}0000`;
      const no = String(i).padStart(2, "0");
      await makeCategory({ code: fam, nameTr: `Kaplama grubu ${no}`, level: 2, parentId: "30000000", sortOrder: i });
      await makeCategory({ code: `${fam.slice(0, 4)}1500`, nameTr: `Yüzey işlemi ${no}`, level: 3, parentId: fam });
    }
    // Katalog sırasında EN SONDA: kökle çekilen ilk 20 ailenin dışında kalıyordu.
    await makeCategory({ code: "31000000", nameTr: "Üretim bileşenleri", level: 1, sortOrder: 5 });
    await makeCategory({ code: "31160000", nameTr: "Kaplinler ve bağlantılar", level: 2, parentId: "31000000", sortOrder: 99 });
    await makeCategory({ code: "31161500", nameTr: "Esnek bağlantılar", level: 3, parentId: "31160000" });

    const res = await service().searchHierarchical("kaplin");

    expect(res.segments.map((s) => s.code)).toEqual(["31000000", "30000000"]);
    const families = res.segments.flatMap((s) => s.families);
    expect(families[0]).toMatchObject({ code: "31160000", isMatch: true });
    expect(families[0]!.classes.map((c) => [c.code, c.parentMatch])).toEqual([["31161500", true]]);
    // Kalan 19 yer kökle eşleşen ailelerle dolar (toplam aile tavanı 20).
    expect(families.filter((f) => f.isMatch)).toHaveLength(20);
  });

  it("'fries' / 'copies': 4 karakterden kısa kök ('fr', 'cop') kullanılmaz — sonuç yok, kürasyon kuyruğuna yazılır", async () => {
    await makeCategory({ code: "25000000", nameTr: "Araçlar", level: 1 });
    await makeCategory({ code: "25170000", nameTr: "Taşıt bileşenleri", level: 2, parentId: "25000000" });
    await makeCategory({ code: "25171700", nameTr: "Fren sistemleri ve bileşenleri", level: 3, parentId: "25170000" });
    await makeCategory({ code: "25171800", nameTr: "Bakır dövme parçalar", level: 3, parentId: "25170000", nameEn: "Copper forgings" });
    await makeCategory({ code: "25171900", nameTr: "Fotokopi kağıdı", level: 3, parentId: "25170000", nameEn: "Copy paper" });

    for (const q of ["fries", "copies"]) {
      const res = await service().searchHierarchical(q);
      expect({ q, segments: res.segments, truncated: res.truncated }).toEqual({ q, segments: [], truncated: false });
    }
    const misses = await prisma.categorySearchMiss.findMany({ orderBy: { query: "asc" } });
    expect(misses.map((m) => [m.query, m.count])).toEqual([
      ["copies", 1],
      ["fries", 1],
    ]);
    // 4 karakterlik kök hâlâ çalışır: "pipes" → "pipe".
    await makeCategory({ code: "25172000", nameTr: "Çelik boru", level: 3, parentId: "25170000", nameEn: "Steel pipe" });
    expect(flatClasses(await service().searchHierarchical("pipes")).map((c) => c.code)).toEqual(["25172000"]);
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

/**
 * category-17 (arayüz testi 2026-10): `%` ve `_` JOKER DEĞİL, düz karakter.
 *
 * Prisma `contains` değeri LIKE desenine olduğu gibi koyuyordu: "%%" ve "__"
 * bütün satırlarla, "a_" "a" + herhangi bir karakterle eşleşiyor, 200 alakasız
 * kategori dönüyordu.
 */
describe("CategoryService.searchTree — % ve _ düz karakter (category-17)", () => {
  const classNames = (res: Awaited<ReturnType<CategoryService["searchHierarchical"]>>) =>
    res.segments.flatMap((s) => s.families.flatMap((f) => f.classes)).map((c) => c.nameTr);

  async function catalog() {
    await makeCategory({ code: "11000000", nameTr: "Metaller", level: 1 });
    await makeCategory({ code: "11100000", nameTr: "Alaşımlar", level: 2, parentId: "11000000" });
    await makeCategory({ code: "11101500", nameTr: "Bakır alaşım", level: 3, parentId: "11100000" });
    await makeCategory({ code: "11101600", nameTr: "Bor mineralleri", level: 3, parentId: "11100000" });
    await makeCategory({ code: "11101700", nameTr: "%50 nikel alaşım", level: 3, parentId: "11100000" });
    await makeCategory({ code: "11101800", nameTr: "Alt_tip a_b profil", level: 3, parentId: "11100000" });
    await makeCategory({ code: "11101900", nameTr: "C\\D sınıfı sac", level: 3, parentId: "11100000" });
  }

  it("yalnız joker karakterden oluşan sorgu hiçbir şeyle eşleşmez", async () => {
    await catalog();
    for (const q of ["%%", "__", "%_", "_%_", "\\\\"]) {
      const res = await service().searchHierarchical(q);
      expect({ q, segments: res.segments, truncated: res.truncated }).toEqual({
        q,
        segments: [],
        truncated: false,
      });
    }
  });

  it("'a_' ve 'bo%' yalnız o karakteri GERÇEKTEN taşıyan adı bulur", async () => {
    await catalog();
    // Eskiden "a_" = "a" + herhangi bir karakter → bütün satırlar.
    expect(classNames(await service().searchHierarchical("a_"))).toEqual(["Alt_tip a_b profil"]);
    // Eskiden "bo%" = "bo" ile başlayan her şey → "Bor mineralleri".
    expect(classNames(await service().searchHierarchical("bo%"))).toEqual([]);
  });

  it("adında % / _ / \\ geçen kategori o karakterle aranınca bulunur", async () => {
    await catalog();
    expect(classNames(await service().searchHierarchical("%50"))).toEqual(["%50 nikel alaşım"]);
    expect(classNames(await service().searchHierarchical("alt_tip"))).toEqual(["Alt_tip a_b profil"]);
    expect(classNames(await service().searchHierarchical("c\\d"))).toEqual(["C\\D sınıfı sac"]);
  });

  it("searchText'i boş (legacy) satırda nameTr yedeği de joker saymaz", async () => {
    await catalog();
    await prisma.category.updateMany({ where: { level: 3 }, data: { searchText: "" } });
    expect(classNames(await service().searchHierarchical("a_"))).toEqual(["Alt_tip a_b profil"]);
    expect(classNames(await service().searchHierarchical("%%"))).toEqual([]);
  });

  it("yalnız bağlaçtan oluşan sorguda (bütün ifade yolu) da joker yok", async () => {
    await catalog();
    await makeCategory({ code: "11102000", nameTr: "Sac ve levha", level: 3, parentId: "11100000" });
    // "ve" bağlaç, "_" tek harf → kelime kalmaz, bütün ifade ("ve _") aranır.
    // `_` joker olsaydı "Sac ve levha" ("ve " + herhangi bir karakter) eşleşirdi.
    expect((await service().searchHierarchical("ve _")).segments).toEqual([]);
    // Denetim: aynı yol jokersiz ifadeyle satırı bulur.
    const found = await service().searchHierarchical("ve");
    expect(found.segments.flatMap((s) => s.families.flatMap((f) => f.classes)).map((c) => c.nameTr)).toEqual([
      "Sac ve levha",
    ]);
  });
});

/**
 * category-18 (arayüz testi 2026-10): listede görünen SEKTÖR adını yazan
 * kullanıcı "sonuç bulunamadı" görüyordu (arama L2-L4'e bakıyordu) ve adı
 * eşleşen ailenin altındaki sınıflar işaretsiz geldiği için arayüz aileyi
 * çıplak başlık olarak çiziyordu.
 */
describe("CategoryService.searchTree — sektör adı ve aile altı sınıflar (category-18)", () => {
  async function electric() {
    await makeCategory({ code: "39000000", nameTr: "Elektrik Sistemleri ve Aydınlatma", level: 1, sortOrder: 39 });
    await makeCategory({ code: "39100000", nameTr: "Lambalar ve ampuller", level: 2, parentId: "39000000", sortOrder: 1 });
    await makeCategory({ code: "39101600", nameTr: "Ampuller", level: 3, parentId: "39100000", sortOrder: 1 });
    await makeCategory({ code: "39101800", nameTr: "Lamba bileşenleri", level: 3, parentId: "39100000", sortOrder: 2 });
    await makeCategory({ code: "39120000", nameTr: "Elektrik ekipmanları", level: 2, parentId: "39000000", sortOrder: 2 });
    await makeCategory({ code: "39121000", nameTr: "Güç dağıtım donanımı", level: 3, parentId: "39120000", sortOrder: 1 });
    await makeCategory({ code: "39121011", nameTr: "Kesintisiz güç kaynağı", level: 4, parentId: "39121000", sortOrder: 1 });
  }

  it("sektör adı yazılınca sektör bütün aileleri ve sınıflarıyla döner", async () => {
    await electric();
    // Başka sektör: sorguyla ilgisi yok, dönmemeli.
    await makeCategory({ code: "41000000", nameTr: "Laboratuvar Ekipmanı", level: 1, sortOrder: 41 });
    await makeCategory({ code: "41100000", nameTr: "Ölçüm cihazları", level: 2, parentId: "41000000" });
    await makeCategory({ code: "41101500", nameTr: "Teraziler", level: 3, parentId: "41100000" });

    const res = await service().searchHierarchical("Elektrik Sistemleri ve Aydınlatma");

    expect(res.truncated).toBe(false);
    expect(res.segments.map((s) => [s.code, s.isMatch])).toEqual([["39000000", true]]);
    const seg = res.segments[0]!;
    expect(seg.families.map((f) => [f.code, f.isMatch])).toEqual([
      ["39100000", false],
      ["39120000", false],
    ]);
    // Sınıflar seçilebilir satır olarak işaretli; emtialar (L4) açılmaz.
    expect(
      seg.families.flatMap((f) => f.classes).map((c) => [c.code, c.isMatch, c.parentMatch, c.commodities.length]),
    ).toEqual([
      ["39101600", false, true, 0],
      ["39101800", false, true, 0],
      ["39121000", false, true, 0],
    ]);
    // Sonuç bulundu → kürasyon kuyruğuna yazılmaz.
    expect(await prisma.categorySearchMiss.count()).toBe(0);
  });

  it("aksansız / çekimli / eksik yazım da sektörü bulur", async () => {
    await electric();
    for (const q of ["elektrik sistemleri ve aydinlatma", "elektrik sistemi", "aydınlatma elektrik"]) {
      const res = await service().searchHierarchical(q);
      expect({ q, hit: res.segments.find((s) => s.code === "39000000")?.isMatch }).toEqual({ q, hit: true });
    }
  });

  it("sektörün adında geçmeyen kelime sektörü DÖNDÜRMEZ (yalnız eş anlamlısında geçse de)", async () => {
    await makeCategory({
      code: "31000000",
      nameTr: "Üretim Bileşenleri ve Malzemeleri",
      level: 1,
      keywords: "rulman civata tedarikçileri",
    });
    await makeCategory({ code: "31170000", nameTr: "Yataklar ve dişliler", level: 2, parentId: "31000000" });
    await makeCategory({ code: "31171500", nameTr: "Rulmanlar", level: 3, parentId: "31170000" });
    await makeCategory({ code: "31171600", nameTr: "Burçlar", level: 3, parentId: "31170000" });

    const res = await service().searchHierarchical("rulman");

    // Sektör yalnız zincir olarak var (Rulmanlar'ın atası), eşleşme değil:
    // kardeş sınıf "Burçlar" listeye GİRMEZ.
    expect(res.segments.map((s) => [s.code, s.isMatch])).toEqual([["31000000", false]]);
    expect(res.segments[0]!.families.flatMap((f) => f.classes).map((c) => c.code)).toEqual(["31171500"]);
    // Sektör adı + adda olmayan kelime → AND tutmaz, sektör dönmez.
    expect((await service().searchHierarchical("üretim hidrolik")).segments).toEqual([]);
  });

  it("gerçek eşleşmesi olan aile sektör içinde öne geçer; sınıf hem eşleşme hem işaretli olabilir", async () => {
    await electric();
    const res = await service().searchHierarchical("elektrik");

    const seg = res.segments.find((s) => s.code === "39000000")!;
    expect(seg.isMatch).toBe(true);
    // "Elektrik ekipmanları" ailesi adıyla eşleşti → katalog sırasında sonra
    // gelse de öne geçer; "Lambalar" yalnız sektör yüzünden listede.
    expect(seg.families.map((f) => [f.code, f.isMatch])).toEqual([
      ["39120000", true],
      ["39100000", false],
    ]);
    for (const cls of seg.families.flatMap((f) => f.classes)) {
      expect({ code: cls.code, parentMatch: cls.parentMatch }).toEqual({ code: cls.code, parentMatch: true });
    }
  });

  it("aile adı eşleşince altındaki sınıflar parentMatch ile işaretlenir; emtiadan gelen sınıf işaretlenmez", async () => {
    await electric();
    await makeCategory({ code: "40000000", nameTr: "Dağıtım Sistemleri", level: 1, sortOrder: 40 });
    await makeCategory({ code: "40140000", nameTr: "Akışkan iletimi", level: 2, parentId: "40000000" });
    await makeCategory({ code: "40141600", nameTr: "Vanalar", level: 3, parentId: "40140000" });
    await makeCategory({ code: "40141601", nameTr: "Lambalar için vana", level: 4, parentId: "40141600" });

    const res = await service().searchHierarchical("lambalar");

    const byCode = new Map(
      res.segments.flatMap((s) => s.families.flatMap((f) => f.classes)).map((c) => [c.code, c] as const),
    );
    // "Lambalar ve ampuller" ailesi eşleşti → iki sınıfı da listelenir.
    expect(byCode.get("39101600")).toMatchObject({ isMatch: false, parentMatch: true });
    expect(byCode.get("39101800")).toMatchObject({ parentMatch: true });
    // "Vanalar" yalnız eşleşen emtianın başlığı: seçilebilir satır DEĞİL.
    expect(byCode.get("40141600")).toMatchObject({ isMatch: false, parentMatch: false });
    expect(byCode.get("40141600")!.commodities.map((c) => c.code)).toEqual(["40141601"]);
    const families = res.segments.flatMap((s) => s.families);
    expect(families.find((f) => f.code === "39100000")?.isMatch).toBe(true);
    expect(families.find((f) => f.code === "40140000")?.isMatch).toBe(false);
    // Hiçbir sektör adı eşleşmedi.
    expect(res.segments.every((s) => !s.isMatch)).toBe(true);
  });

  it("çok sektörde geçen genel kelime: en fazla 3 sektör açılır ve truncated döner", async () => {
    for (const [i, name] of ["Tarım", "Madencilik", "Üretim", "Elleçleme", "Genel"].entries()) {
      const seg = `${20 + i}000000`;
      await makeCategory({ code: seg, nameTr: `${name} Makineleri`, level: 1, sortOrder: i });
      await makeCategory({ code: `${20 + i}100000`, nameTr: `${name} ailesi`, level: 2, parentId: seg });
      await makeCategory({ code: `${20 + i}101500`, nameTr: `${name} sınıfı`, level: 3, parentId: `${20 + i}100000` });
    }

    const res = await service().searchHierarchical("makineleri");

    expect(res.segments.filter((s) => s.isMatch).map((s) => s.code)).toEqual([
      "20000000",
      "21000000",
      "22000000",
    ]);
    expect(res.truncated).toBe(true);
    // Tam ad tek sektörü seçer → kesilme yok.
    const exact = await service().searchHierarchical("madencilik makineleri");
    expect(exact.segments.map((s) => [s.code, s.isMatch])).toEqual([["21000000", true]]);
    expect(exact.truncated).toBe(false);
  });

  it("gizli segment, kod araması ve yalnız bağlaçtan oluşan sorgu sektör döndürmez", async () => {
    await electric();
    // 43 gizli segment (HIDDEN_SEGMENTS).
    await makeCategory({ code: "43000000", nameTr: "Bilişim ve Yayıncılık", level: 1 });
    await makeCategory({ code: "43230000", nameTr: "Yazılım", level: 2, parentId: "43000000" });
    await makeCategory({ code: "43231500", nameTr: "İş yazılımları", level: 3, parentId: "43230000" });

    expect((await service().searchHierarchical("bilişim yayıncılık")).segments).toEqual([]);
    // Kod araması değişmedi: sektör kendi adıyla "eşleşmiş" sayılmaz.
    const byCode = await service().searchHierarchical("39");
    expect(byCode.segments.map((s) => [s.code, s.isMatch])).toEqual([["39000000", false]]);
    // "ve" yalnız bağlaç: "… ve Aydınlatma" sektörünü açmaz.
    const stop = await service().searchHierarchical("ve");
    expect(stop.segments.every((s) => !s.isMatch)).toBe(true);
  });
});

/**
 * sector-name-criterion. Sektörü açan ölçüt: (a) noktalama taşıyan kelime
 * (tire) adın sözcükleriyle hiç eşleşmiyordu — sektör kendi Rusça adıyla
 * bulunamıyordu; (b) başka bir sözcüğün İÇİNDE geçmek de sayılıyordu —
 * "acil", İngilizce adında "Facility" geçen sektörü bütün aileleriyle açıyordu.
 */
describe("CategoryService.searchTree — sektör adı ölçütü (sector-name-criterion)", () => {
  it("tireli kelime taşıyan Rusça sektör adı sektörü bulur", async () => {
    const nameRu = "Оборудование для погрузочно-разгрузочных работ, кондиционирования и хранения";
    await makeCategory({
      code: "24000000",
      nameTr: "Malzeme Taşıma, İklimlendirme ve Depolama Makineleri",
      nameRu,
      level: 1,
    });
    await makeCategory({ code: "24100000", nameTr: "Endüstriyel taşıma ekipmanları", level: 2, parentId: "24000000" });
    await makeCategory({ code: "24101500", nameTr: "Endüstriyel el arabaları", level: 3, parentId: "24100000" });

    const res = await service().searchHierarchical(nameRu);

    expect(res.segments.map((s) => [s.code, s.isMatch])).toEqual([["24000000", true]]);
    expect(
      res.segments[0]!.families.flatMap((f) => f.classes).map((c) => [c.code, c.parentMatch]),
    ).toEqual([["24101500", true]]);
    expect(await prisma.categorySearchMiss.count()).toBe(0);
  });

  it("'acil': adında yalnız başka bir sözcüğün içinde geçen ('Facility') sektör AÇILMAZ", async () => {
    await makeCategory({
      code: "72000000",
      nameTr: "Bina ve Tesis İnşaat ve Bakım Hizmetleri",
      nameEn: "Building and Facility Construction and Maintenance Services",
      level: 1,
      sortOrder: 0,
    });
    await makeCategory({ code: "72100000", nameTr: "Bina bakım hizmetleri", level: 2, parentId: "72000000" });
    await makeCategory({ code: "72101500", nameTr: "Bina destek hizmetleri", level: 3, parentId: "72100000" });
    await makeCategory({ code: "46000000", nameTr: "Savunma ve Güvenlik", level: 1, sortOrder: 5 });
    await makeCategory({ code: "46190000", nameTr: "Yangından korunma", level: 2, parentId: "46000000" });
    await makeCategory({ code: "46191600", nameTr: "Acil durum ekipmanı", level: 3, parentId: "46190000" });

    const res = await service().searchHierarchical("acil");

    // Yalnız gerçek eşleşmenin zinciri; sektör 72 ve 46 "eşleşmiş sektör" değil.
    expect(res.segments.map((s) => [s.code, s.isMatch])).toEqual([["46000000", false]]);
    expect(res.segments[0]!.families.flatMap((f) => f.classes).map((c) => c.code)).toEqual(["46191600"]);
  });

  it("sözcük BAŞI yeterli: yarım yazılan kelime ('elektrik sist') sektörü yine açar", async () => {
    await makeCategory({ code: "39000000", nameTr: "Elektrik Sistemleri ve Aydınlatma", level: 1 });
    await makeCategory({ code: "39100000", nameTr: "Lambalar ve ampuller", level: 2, parentId: "39000000" });
    await makeCategory({ code: "39101600", nameTr: "Ampuller", level: 3, parentId: "39100000" });

    for (const q of ["elektrik sist", "aydinlatma sistemleri"]) {
      const res = await service().searchHierarchical(q);
      expect({ q, hit: res.segments.map((s) => [s.code, s.isMatch]) }).toEqual({ q, hit: [["39000000", true]] });
    }
  });
});
