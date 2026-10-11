import {
  HIDDEN_BRANCH_PREFIXES,
  HIDDEN_CATEGORY_PREFIXES,
  HIDDEN_SEGMENTS,
  categoryCatalogWhere,
  categorySubtreeMatcher,
  categorySubtreeWhere,
  hiddenCategoryPrefixOf,
  hiddenCategoryWhere,
  hiddenPrefixesUnder,
  isHiddenCategory,
  profileCompleteness,
  visibleCategoryId,
  visibleCategoryIds,
  visibleCompanyCategorySelection,
} from "@rothern/shared";

/**
 * KATALOG SADELEŞTİRME (2026-09-19, kullanıcı kararı): sanayi/inşaat/imalat
 * dışı dallar ürün arayüzünden gizli (sayı yorumda tutulmaz — aşağıdaki
 * testler kilitler). Satır silinmez — tek kaynak `@rothern/shared`
 * `category-catalog.ts`; seçici, arama, facet, sitemap ve doğrulama kapıları
 * aynı tanımı okur.
 *
 * 2026-10-09 (kullanıcı kararı): 46 ve 77 gizlendi.
 * 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
 * GERİ AÇILDI; yalnız silah ve kolluk aileleri (+ 461825 sınıfı) gizli kaldı.
 * Kuralın birimi artık kod ÖNEKİ: segment (2 hane), aile (4), sınıf (6).
 */
describe("gizli segmentler", () => {
  it("30 segment gizli, sanayi çekirdeği ve 46 açık", () => {
    expect(HIDDEN_SEGMENTS).toHaveLength(30);
    expect(new Set(HIDDEN_SEGMENTS).size).toBe(30);
    for (const s of ["10", "42", "43", "44", "50", "51", "56", "77", "80", "85", "94"]) {
      expect(HIDDEN_SEGMENTS).toContain(s);
    }
    // Anasayfada görünen 28 segmentin TAMAMI (kullanıcı: "anasayfada olmayan
    // kategori başka yerde de gösterilmesin" — liste iki yönde de kilitli).
    const visible = [
      "11", "12", "13", "14", "15", "30", "31", "32",
      "20", "21", "22", "23", "24", "25", "26", "27", "39", "40", "41", "47",
      "46",
      "71", "72", "73", "76", "78", "81",
      "95",
    ];
    expect(visible).toHaveLength(28);
    for (const s of visible) expect(HIDDEN_SEGMENTS).not.toContain(s);
    // Ariba'nın 58 segmenti: gizli + görünür = tamamı, kesişim yok.
    expect(new Set([...HIDDEN_SEGMENTS, ...visible]).size).toBe(58);
    for (const s of HIDDEN_SEGMENTS) expect(s).toMatch(/^\d{2}$/);
  });

  it("isHiddenCategory tümüyle gizli segmentte kodu SEGMENTİNE göre yargılar (her seviye)", () => {
    expect(isHiddenCategory("50000000")).toBe(true);
    expect(isHiddenCategory("50131700")).toBe(true); // gıda L3
    expect(isHiddenCategory("85121600")).toBe(true); // sağlık hizmeti L3
    expect(isHiddenCategory("77101500")).toBe(true); // çevre hizmeti L3 (2026-10-09)
    expect(isHiddenCategory("78101800")).toBe(false); // lojistik
    expect(isHiddenCategory("39121600")).toBe(false); // elektrik
    expect(isHiddenCategory("23151500")).toBe(false); // üretim makinesi
    expect(isHiddenCategory(null)).toBe(false);
    expect(isHiddenCategory(undefined)).toBe(false);
    expect(isHiddenCategory("")).toBe(false);
    expect(isHiddenCategory("4")).toBe(false);
  });
});

describe("46 geri açıldı: yalnız silah ve kolluk dalları gizli (2026-10-10)", () => {
  it("gizli dallar: sekiz aile + görünür 4618 ailesinin tek sınıfı", () => {
    expect([...HIDDEN_BRANCH_PREFIXES]).toEqual(["4610", "4611", "4612", "4613", "4614", "4615", "4620", "4622", "461825"]);
    // Aile 4, sınıf 6 hane; hepsi GÖRÜNÜR bir segmentin altında (gizli segmentin
    // dalı ayrıca yazılmaz — zaten gizli).
    for (const p of HIDDEN_BRANCH_PREFIXES) {
      expect(p).toMatch(/^(\d{4}|\d{6})$/);
      expect(HIDDEN_SEGMENTS).not.toContain(p.slice(0, 2));
    }
  });

  it("tek tanım: birleşik liste = segmentler + dallar; hiçbir önek bir başkasının altında değil", () => {
    expect([...HIDDEN_CATEGORY_PREFIXES]).toEqual([...HIDDEN_SEGMENTS, ...HIDDEN_BRANCH_PREFIXES]);
    expect(new Set(HIDDEN_CATEGORY_PREFIXES).size).toBe(HIDDEN_CATEGORY_PREFIXES.length);
    for (const a of HIDDEN_CATEGORY_PREFIXES) {
      for (const b of HIDDEN_CATEGORY_PREFIXES) {
        if (a !== b) expect(`${a} under ${b}: ${a.startsWith(b)}`).toBe(`${a} under ${b}: false`);
      }
    }
  });

  it("segmentin kendisi ve iş güvenliği / yangın aileleri GÖRÜNÜR", () => {
    for (const code of [
      "46000000", // İş Güvenliği ve Yangın Ekipmanları
      "46160000", "46161500", "46161600", "46161700", // trafik kontrol, su güvenliği, kurtarma
      "46170000", "46171500", "46171600", "46171700", // kilit, gözetleme, araç geçiş kontrolü
      "46180000", "46181500", "46181700", "46182400", "46181701", // kişisel koruyucu donanım
      "46190000", "46191500", "46191600", "46191601", // yangından korunma
      "46210000", "46211500", "46211600", "46211700", // iş güvenliği
    ]) {
      expect(`${code}: ${isHiddenCategory(code)}`).toBe(`${code}: false`);
    }
  });

  it("silah ve kolluk aileleri HER seviyede gizli (aile, sınıf, yaprak)", () => {
    for (const code of [
      "46100000", "46101500", "46101501", // hafif silahlar ve mühimmat
      "46110000", "46111500", // geleneksel savaş silahları
      "46120000", "46121600", // füzeler
      "46130000", "46131506", // roketler
      "46140000", "46141500", // fırlatıcılar
      "46150000", "46151500", "46151716", // kolluk: kalabalık kontrol, adli
      "46200000", "46201000", "46201100", // kamu güvenliği / hafif silah eğitim ekipmanı
      "46220000", "46221500", // silah imha, mayın temizleme
    ]) {
      expect(`${code}: ${isHiddenCategory(code)}`).toBe(`${code}: true`);
    }
  });

  it("461825 sınıfı gizli, kardeş sınıfları ve ailesi görünür", () => {
    expect(isHiddenCategory("46182500")).toBe(true);
    expect(isHiddenCategory("46182501")).toBe(true);
    expect(isHiddenCategory("46182507")).toBe(true);
    expect(isHiddenCategory("46182400")).toBe(false);
    expect(isHiddenCategory("46182401")).toBe(false);
    expect(isHiddenCategory("46180000")).toBe(false);
  });

  it("hiddenCategoryPrefixOf kodu kapsayan öneki verir; uzunluğu düzeyi söyler", () => {
    expect(hiddenCategoryPrefixOf("10101500")).toBe("10"); // segment
    expect(hiddenCategoryPrefixOf("46101500")).toBe("4610"); // aile
    expect(hiddenCategoryPrefixOf("46182501")).toBe("461825"); // sınıf
    expect(hiddenCategoryPrefixOf("46181500")).toBeNull();
    expect(hiddenCategoryPrefixOf("46000000")).toBeNull();
    expect(hiddenCategoryPrefixOf("31161500")).toBeNull();
    expect(hiddenCategoryPrefixOf(null)).toBeNull();
    expect(hiddenCategoryPrefixOf("")).toBeNull();
  });

  it("kodun BAŞ KISMI da yargılanır (kod aramasına yazılan önek)", () => {
    expect(isHiddenCategory("46")).toBe(false);
    expect(isHiddenCategory("461")).toBe(false);
    expect(isHiddenCategory("4610")).toBe(true);
    expect(isHiddenCategory("46101")).toBe(true);
    expect(isHiddenCategory("4618")).toBe(false);
    expect(isHiddenCategory("46182")).toBe(false);
    expect(isHiddenCategory("461825")).toBe(true);
    expect(isHiddenCategory("77")).toBe(true);
    expect(hiddenCategoryPrefixOf("4615")).toBe("4615");
    expect(hiddenCategoryPrefixOf("7710")).toBe("77");
  });
});

describe("Prisma where parçası", () => {
  it("her gizli ÖNEK için startsWith taşır (segment + aile + sınıf) ve katalog seçimine eklenir", () => {
    const w = hiddenCategoryWhere();
    expect(w.NOT).toHaveLength(HIDDEN_CATEGORY_PREFIXES.length);
    expect(w.NOT).toHaveLength(HIDDEN_SEGMENTS.length + HIDDEN_BRANCH_PREFIXES.length);
    expect(w.NOT).toContainEqual({ id: { startsWith: "50" } });
    expect(w.NOT).toContainEqual({ id: { startsWith: "4610" } });
    expect(w.NOT).toContainEqual({ id: { startsWith: "461825" } });
    expect(w.NOT).not.toContainEqual({ id: { startsWith: "46" } });
    expect(Object.keys(w)).toEqual(["NOT"]);
    expect(categoryCatalogWhere("discovery")).toEqual({ inDiscovery: true, ...w });
    expect(categoryCatalogWhere("full")).toEqual({ ...w });
  });

  it("kodu başka adla tutan tabloda alan adıyla çağrılır; liste aynı", () => {
    const w = hiddenCategoryWhere("categoryId");
    expect(w.NOT).toHaveLength(HIDDEN_CATEGORY_PREFIXES.length);
    expect(w.NOT).toContainEqual({ categoryId: { startsWith: "77" } });
    expect(w.NOT).toContainEqual({ categoryId: { startsWith: "4622" } });
    expect(w.NOT.map((c) => c.categoryId.startsWith)).toEqual([...HIDDEN_CATEGORY_PREFIXES]);
  });
});

describe("saklanmış kodların gösterimi (2026-10-09: 'anasayfada olmayan kategori hiçbir yerde gösterilmez')", () => {
  it("visibleCategoryIds gizli kodları düşürür, sırayı korur, boş / null girdide boş döner", () => {
    expect(visibleCategoryIds(["46101500", "39121600", "77101500", "46181500", "78101800", "10101500", "46182501"])).toEqual([
      "39121600",
      "46181500",
      "78101800",
    ]);
    expect(visibleCategoryIds([null, undefined, "", "31000000"])).toEqual(["31000000"]);
    expect(visibleCategoryIds(null)).toEqual([]);
    expect(visibleCategoryIds(undefined)).toEqual([]);
  });

  it("visibleCategoryId tek kodda aynı kuralı uygular", () => {
    expect(visibleCategoryId("46101500")).toBeNull();
    expect(visibleCategoryId("46182500")).toBeNull();
    expect(visibleCategoryId("10101500")).toBeNull();
    expect(visibleCategoryId("46181500")).toBe("46181500");
    expect(visibleCategoryId("46000000")).toBe("46000000");
    expect(visibleCategoryId("39121600")).toBe("39121600");
    expect(visibleCategoryId(null)).toBeNull();
    expect(visibleCategoryId("")).toBeNull();
  });
});

/**
 * GÖRÜNÜR ATANIN GİZLİ TORUNU (2026-10-10). Önek düzeyinde gizlemenin yeni
 * sonucu: 46 görünür, 4610 gizli. Görünür bir kategorinin alt ağacını gezen /
 * sayan her şey gizli torunları dışarıda bırakır — 4610xxxx'te saklanmış kayıt
 * "İş Güvenliği ve Yangın Ekipmanları" altında listelenmez, sayılmaz.
 */
describe("görünür kategorinin alt ağacı: gizli torunlar dışarıda", () => {
  const UNDER_46 = ["4610", "4611", "4612", "4613", "4614", "4615", "4620", "4622", "461825"];

  it("hiddenPrefixesUnder: kodun / önekin altındaki gizli önekler", () => {
    expect(hiddenPrefixesUnder("46000000")).toEqual(UNDER_46);
    expect(hiddenPrefixesUnder("46")).toEqual(UNDER_46);
    expect(hiddenPrefixesUnder("46180000")).toEqual(["461825"]);
    expect(hiddenPrefixesUnder("4618")).toEqual(["461825"]);
    // Gizli torunu olmayan görünür kodlar.
    expect(hiddenPrefixesUnder("46190000")).toEqual([]);
    expect(hiddenPrefixesUnder("46181500")).toEqual([]);
    expect(hiddenPrefixesUnder("46181501")).toEqual([]);
    expect(hiddenPrefixesUnder("31000000")).toEqual([]);
    // Kendisi gizli olan kodun ALTINDA ayrıca gizlenecek bir şey yok.
    expect(hiddenPrefixesUnder("46100000")).toEqual([]);
    expect(hiddenPrefixesUnder("46182500")).toEqual([]);
    expect(hiddenPrefixesUnder("10000000")).toEqual([]);
    // Geçersiz girdi.
    for (const bad of [null, undefined, "", "4", "461", "46000", "4600000", "abcdefgh", "460000000"]) {
      expect(hiddenPrefixesUnder(bad)).toEqual([]);
    }
  });

  it("categorySubtreeWhere: gizli torunu olmayan kodda biçim eskisiyle AYNI (NOT anahtarı yok)", () => {
    expect(categorySubtreeWhere("31160000", "categoryId")).toEqual({ categoryId: { startsWith: "3116" } });
    expect(categorySubtreeWhere("31000000", "categoryId")).toEqual({ categoryId: { startsWith: "31" } });
    expect(categorySubtreeWhere("31161500", "categoryId")).toEqual({ categoryId: { startsWith: "311615" } });
    expect(categorySubtreeWhere("31161501", "categoryId")).toEqual({ categoryId: { startsWith: "31161501" } });
    expect(categorySubtreeWhere("46190000", "categoryId")).toEqual({ categoryId: { startsWith: "4619" } });
    expect(Object.keys(categorySubtreeWhere("46181500", "id")!)).toEqual(["id"]);
  });

  it("categorySubtreeWhere: görünür atada gizli torunlar NOT listesinde", () => {
    expect(categorySubtreeWhere("46000000", "categoryId")).toEqual({
      categoryId: { startsWith: "46" },
      NOT: UNDER_46.map((p) => ({ categoryId: { startsWith: p } })),
    });
    expect(categorySubtreeWhere("46180000", "id")).toEqual({
      id: { startsWith: "4618" },
      NOT: [{ id: { startsWith: "461825" } }],
    });
    // Önek girdisi kodla aynı sonucu verir.
    expect(categorySubtreeWhere("46", "categoryId")).toEqual(categorySubtreeWhere("46000000", "categoryId"));
    expect(categorySubtreeWhere("4618", "id")).toEqual(categorySubtreeWhere("46180000", "id"));
  });

  it("categorySubtreeWhere: kendisi gizli kodda HAM alt ağaç; geçersiz girdide null", () => {
    // "Gizli kod süzgeç değildir" kararı çağıranındır (`visibleCategoryId`);
    // ilişkili ürün blokları eski ürünün kendi kodundan bilinçli HAM çıkar.
    expect(categorySubtreeWhere("46101500", "categoryId")).toEqual({ categoryId: { startsWith: "461015" } });
    expect(categorySubtreeWhere("10000000", "categoryId")).toEqual({ categoryId: { startsWith: "10" } });
    for (const bad of [null, undefined, "", "461", "abcdefgh"]) {
      expect(categorySubtreeWhere(bad, "categoryId")).toBeNull();
    }
  });

  it("categorySubtreeMatcher: bellekteki ikiz — aynı kural", () => {
    const under46 = categorySubtreeMatcher("46000000")!;
    expect(["46181500", "46191601", "46211700", "46000000", "46160000"].map(under46)).toEqual([true, true, true, true, true]);
    expect(["46101500", "46151716", "46201100", "46221500", "46182501", "46100000"].map(under46)).toEqual([
      false, false, false, false, false, false,
    ]);
    expect(["31161500", "47000000", "", null, undefined].map(under46)).toEqual([false, false, false, false, false]);

    const under4618 = categorySubtreeMatcher("4618")!;
    expect(under4618("46181500")).toBe(true);
    expect(under4618("46182400")).toBe(true);
    expect(under4618("46182500")).toBe(false);
    expect(under4618("46182503")).toBe(false);
    expect(under4618("46190000")).toBe(false);

    // Gizli torunu olmayan kod: düz önek eşleşmesi.
    const under3116 = categorySubtreeMatcher("31160000")!;
    expect(under3116("31161500")).toBe(true);
    expect(under3116("31170000")).toBe(false);
    // Kendisi gizli kod: ham alt ağaç (where ile aynı).
    expect(categorySubtreeMatcher("46100000")!("46101500")).toBe(true);
    expect(categorySubtreeMatcher("bad")).toBeNull();
    expect(categorySubtreeMatcher(null)).toBeNull();
  });

  it("where ve matcher AYNI kümeyi seçer (46 altındaki her aile / sınıf örneği)", () => {
    const sample = [
      "46000000", "46100000", "46101500", "46110000", "46121500", "46131600", "46141500", "46151800",
      "46160000", "46161700", "46171600", "46180000", "46181600", "46182500", "46182504", "46190000",
      "46191600", "46200000", "46201000", "46210000", "46211600", "46220000", "46221500", "47101500",
    ];
    for (const root of ["46000000", "46180000", "46190000", "46100000"]) {
      const where = categorySubtreeWhere(root, "categoryId")!;
      const byWhere = sample.filter(
        (c) => c.startsWith(where.categoryId.startsWith) && !(where.NOT ?? []).some((n) => c.startsWith(n.categoryId.startsWith)),
      );
      expect(sample.filter(categorySubtreeMatcher(root)!)).toEqual(byWhere);
    }
    // 46 altında kalanlar: yalnız görünür aileler.
    expect(sample.filter(categorySubtreeMatcher("46000000")!)).toEqual([
      "46000000", "46160000", "46161700", "46171600", "46180000", "46181600", "46190000", "46191600", "46210000", "46211600",
    ]);
  });
});

/**
 * ATA ZİNCİRİ SAKLAYAN KAYIT (firma beyanı). `46101500` seçen firmanın
 * kaydında `46000000` + `46100000` + `46101500` durur; yalnız gizli kodları
 * düşürmek firmayı "İş Güvenliği ve Yangın Ekipmanları — sektörün tamamı"
 * beyan etmiş gibi gösterirdi.
 */
describe("visibleCompanyCategorySelection: gizli seçimin görünür atası da düşer", () => {
  it("gizli kod saklanmamış beyanda sonuç visibleCategoryIds ile birebir aynı (sıra dahil)", () => {
    const main = ["31000000", "46000000"];
    const sub = ["31160000", "31161500", "46180000", "46181500", "46181501"];
    expect(visibleCompanyCategorySelection(main, sub)).toEqual({ mainIds: main, subIds: sub });
    expect(visibleCompanyCategorySelection(null, undefined)).toEqual({ mainIds: [], subIds: [] });
    expect(visibleCompanyCategorySelection(["46000000"], [])).toEqual({ mainIds: ["46000000"], subIds: [] }); // bilinçli "tamamı"
  });

  it("yalnız gizli bir seçimin atası olarak saklanmış segment düşer", () => {
    expect(visibleCompanyCategorySelection(["46000000", "31000000"], ["46100000", "46101500", "31160000", "31161500"])).toEqual({
      mainIds: ["31000000"],
      subIds: ["31160000", "31161500"],
    });
    // Zincirin ara halkası saklanmamış olsa da (eski kayıt) sonuç aynı.
    expect(visibleCompanyCategorySelection(["46000000"], ["46101500"])).toEqual({ mainIds: [], subIds: [] });
    // Bu hâliyle visibleCategoryIds segmenti GERİDE bırakır — fark tam da bu.
    expect(visibleCategoryIds(["46000000"])).toEqual(["46000000"]);
  });

  it("gizli SINIFIN görünür ailesi ve segmenti de düşer (461825)", () => {
    expect(visibleCompanyCategorySelection(["46000000"], ["46180000", "46182500", "46182501"])).toEqual({ mainIds: [], subIds: [] });
  });

  it("altında en az bir görünür seçim olan ata kalır; gizli kardeş düşer", () => {
    expect(
      visibleCompanyCategorySelection(["46000000"], ["46180000", "46181500", "46182500", "46182501", "46100000", "46101500"]),
    ).toEqual({ mainIds: ["46000000"], subIds: ["46180000", "46181500"] });
    expect(visibleCompanyCategorySelection(["46000000"], ["46190000", "46150000", "46151500"])).toEqual({
      mainIds: ["46000000"],
      subIds: ["46190000"],
    });
  });

  it("tümüyle gizli segment ve başka segmentin 'tamamı' seçimi birbirini etkilemez", () => {
    expect(visibleCompanyCategorySelection(["10000000", "46000000", "77000000"], ["10100000", "77101500"])).toEqual({
      mainIds: ["46000000"],
      subIds: [],
    });
  });

  it("profil tamlığı: tek beyanı gizli bir dalda olan firmada 'kategoriler' maddesi eksik", () => {
    const item = (p: Parameters<typeof profileCompleteness>[0]) =>
      profileCompleteness(p).items.find((i) => i.key === "categories")!.done;
    expect(item({ sellerCategoryIds: ["46000000"], sellerSubCategoryIds: ["46100000", "46101500"] })).toBe(false);
    expect(item({ sellerCategoryIds: ["46000000"], sellerSubCategoryIds: ["46180000", "46181500"] })).toBe(true);
    expect(item({ buyerCategoryIds: ["46000000"], buyerSubCategoryIds: ["46150000"], sellerCategoryIds: ["31000000"] })).toBe(true);
    // Alt eksen verilmezse ana eksen tek başına okunur (eski çağrı biçimi).
    expect(item({ sellerCategoryIds: ["46000000"] })).toBe(true);
    expect(item({ sellerCategoryIds: ["10000000"], buyerCategoryIds: ["77000000"] })).toBe(false);
    expect(item({})).toBe(false);
  });
});
