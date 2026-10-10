import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  HIDDEN_BRANCH_PREFIXES,
  HIDDEN_CATEGORY_PREFIXES,
  categoryAncestors,
  foldSearchText,
  isHiddenCategory,
  tokenizeQuery,
} from "@rothern/shared";
import { CATEGORY_ATTRIBUTES } from "../../../../packages/db/src/seeds/category-attributes";
import { buildKeywordsByCode, readI18nNames, readTranslations } from "../../../../packages/db/prisma/scripts/lib/category-keywords";
import {
  cleanI18nCell,
  diffI18nNameExport,
  exportOverwritesFile,
  formatI18nExportDiff,
  leadingCommentBlock,
  planI18nNameExport,
  toI18nExportRows,
} from "../../../../packages/db/prisma/scripts/lib/i18n-name-export";
import {
  BIDS,
  COMPANIES,
  CONNECTIONS,
  LISTINGS,
  PRODUCTS,
  demoAttrProblems,
  marketplaceDemoCategoryRefs,
  marketplaceDemoPhotoRefs,
  marketplaceDemoPhotos,
  type Pr,
} from "../../../../packages/db/prisma/scripts/lib/marketplace-demo-data";
import {
  assertVisibleSeedCategories,
  assertVisibleSeedCategory,
  hiddenSeedCategoryRefs,
  seedPhotoCategoryRefs,
  visiblePromptNodes,
} from "../../../../packages/db/prisma/scripts/lib/seed-category-guard";
import {
  COMPANIES as STAGING_COMPANIES,
  stagingDemoCategoryRefs,
  stagingDemoPhotoRefs,
  stagingDemoPhotos,
} from "../../../../packages/db/prisma/scripts/lib/staging-demo-data";

/**
 * SEED BETİKLERİ GİZLİ KATEGORİYE YAZMAZ (2026-10-09, kullanıcı: "anasayfada
 * olmayan kategori talepte, üründe ya da başka yerde de gösterilmesin").
 * 2026-10-10: gizliliğin birimi kod ÖNEKİ — tümüyle gizli segment ya da görünür
 * bir segmentin gizli ailesi / sınıfı (46 açık; 4610 … 4615, 4620, 4622 ve
 * 461825 gizli). Kapı ikisini de aynı tanımdan okur.
 *
 * Uygulama yolu gizli kategoriyi doğrulama kapılarıyla reddeder; seed betikleri
 * Prisma ile DOĞRUDAN yazar. Denetimde gizli segmentteki QA dışı kayıtların
 * kaynağı bu betiklerdi: `seed-marketplace-demo` (20 firmanın 8'i, 13 ürün,
 * 2 talep) ve `seed-staging-demo` (ücretsiz demo firmanın tamamı, segment 52).
 * Bu dosya DB'siz kısmı kilitler: kapı, demo verisinin kendisi, betiklerin
 * kaynak taraması ve çeviri dosyası dışa aktarım koruması. Gerçek sorgular:
 * integration `seed-scripts-hidden-category.spec`.
 */
const SCRIPTS = resolve(__dirname, "../../../../packages/db/prisma/scripts");
const WEB_PUBLIC = resolve(__dirname, "../../../web/public");
const read = (file: string) => readFileSync(join(SCRIPTS, file), "utf8");

describe("seed kategori kapısı", () => {
  // Eski (legacy) kayıt kodları: gizli AİLE (4610, 2026-10-10), gizli SINIF
  // (461825), tümüyle gizli segmentler (10: 2026-09-19, 77: 2026-10-09).
  const LEGACY = [
    { source: "legacy listing ROT-000834", code: "46101500" },
    { source: "legacy product in a hidden class", code: "46182501" },
    { source: "legacy product", code: "10101500" },
    { source: "legacy company declaration", code: "77000000" },
  ];
  const VISIBLE = [
    { source: "product", code: "31161500" },
    { source: "company sell", code: "78000000" },
    // 46 geri açıldı (2026-10-10): segmentin kendisi, KKD, yangın ve iş güvenliği.
    { source: "company sell (whole sector)", code: "46000000" },
    { source: "product hard hat", code: "46181700" },
    { source: "listing fire fighting", code: "46191600" },
    { source: "product work area safety", code: "46211700" },
  ];

  it("gizli önekin altındaki kodları ayıklar; görünür kod ve boş liste geçer", () => {
    expect(hiddenSeedCategoryRefs([...VISIBLE, ...LEGACY])).toEqual(LEGACY);
    expect(() => assertVisibleSeedCategories("seed-x", VISIBLE)).not.toThrow();
    expect(() => assertVisibleSeedCategories("seed-x", [])).not.toThrow();
    expect(assertVisibleSeedCategory("seed-x", "product", "31161500")).toBe("31161500");
    expect(assertVisibleSeedCategory("seed-x", "product", "46181500")).toBe("46181500");
  });

  it("tek bir gizli kodda DURUR; ileti betiği, kodu ve yerini söyler (ASCII)", () => {
    let message = "";
    try {
      assertVisibleSeedCategories("seed-x", [...VISIBLE, ...LEGACY]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(
      "[seed-x] 4 seed category code(s) sit under a hidden category prefix (HIDDEN_CATEGORY_PREFIXES: segment, family or class).",
    );
    expect(message).toContain("A seed must never write a hidden category; move them to a visible one:");
    expect(message).toContain("46101500  legacy listing ROT-000834");
    expect(message).toContain("46182501  legacy product in a hidden class");
    expect(message).toContain("10101500  legacy product");
    expect(message).toContain("77000000  legacy company declaration");
    for (const visible of VISIBLE) expect(message).not.toContain(visible.code);
    expect(message).toMatch(/^[\x20-\x7E\n]+$/);
    expect(() => assertVisibleSeedCategory("seed-x", "listing category", "46151500")).toThrow(/46151500 {2}listing category/);
  });

  it("gizli listenin HER öneki için çalışır — segment, aile, sınıf (tek kaynak HIDDEN_CATEGORY_PREFIXES)", () => {
    expect(HIDDEN_CATEGORY_PREFIXES.length).toBeGreaterThan(HIDDEN_BRANCH_PREFIXES.length);
    for (const prefix of HIDDEN_CATEGORY_PREFIXES) {
      const code = `${prefix}101500`.slice(0, 8); // "10" → 10101500 · "4610" → 46101015 · "461825" → 46182510
      expect(() => assertVisibleSeedCategory("seed-x", "any", code)).toThrow(/hidden category prefix/);
    }
    // Gizli dalın ÜST düğümü (aile / sınıf satırının kendisi) de reddedilir.
    for (const prefix of HIDDEN_BRANCH_PREFIXES) {
      expect(() => assertVisibleSeedCategory("seed-x", "any", prefix.padEnd(8, "0"))).toThrow(/hidden category prefix/);
    }
  });

  /**
   * GÖRSEL DE KAPIDAN GEÇER (gözden geçirme R-SEED-01). Demo görseli kategori
   * fotoğrafıdır; gizli segmentin fotoğrafı (53 = giyim, 10 = canlı bitki) o
   * kategoriyi adını yazmadan gösterir. Fotoğraf yalnız SEGMENT düzeyinde
   * vardır: 46 geri açıldığı için (2026-10-10) onun fotoğrafı geçer.
   */
  it("görsel yolu segment koduna çevrilir; gizli segmentin fotoğrafı kodla AYNI kapıda durur", () => {
    const refs = seedPhotoCategoryRefs([
      { source: 'product "Tişört" (ege)', src: "/categories/53000000.webp" },
      { source: "company antalya-tarim cover", src: "/categories/10000000.webp" },
      { source: 'product "Cıvata" (demir)', src: "/categories/31000000.webp" },
      { source: 'product "Baret" (demir)', src: "/categories/46000000.webp" },
    ]);
    expect(refs).toEqual([
      { source: 'product "Tişört" (ege) image /categories/53000000.webp', code: "53000000" },
      { source: "company antalya-tarim cover image /categories/10000000.webp", code: "10000000" },
      { source: 'product "Cıvata" (demir) image /categories/31000000.webp', code: "31000000" },
      { source: 'product "Baret" (demir) image /categories/46000000.webp', code: "46000000" },
    ]);
    expect(hiddenSeedCategoryRefs(refs).map((r) => r.code)).toEqual(["53000000", "10000000"]);
    expect(() => assertVisibleSeedCategories("seed-x", refs)).toThrow(
      /53000000 {2}product "Tişört" \(ege\) image \/categories\/53000000\.webp\n {2}10000000 {2}company antalya-tarim cover image/,
    );
    expect(() => assertVisibleSeedCategories("seed-x", refs.slice(2))).not.toThrow();
  });

  it("kategori fotoğrafı olmayan görsel (yüklenmiş dosya, dış adres) başvuru üretmez", () => {
    expect(
      seedPhotoCategoryRefs([
        { source: "uploaded", src: "https://cdn.example.com/tenant-profile/c1/urun.webp" },
        { source: "not a segment file", src: "/categories/53.webp" },
        { source: "other folder", src: "/hero/53000000.webp" },
      ]),
    ).toEqual([]);
  });
});

describe("pazar yeri demo verisi (seed-marketplace-demo)", () => {
  const keys = new Set(COMPANIES.map((c) => c.key));

  it("tarama boş değil: 20 firma, 55 ürün, 16 talep", () => {
    expect(COMPANIES).toHaveLength(20);
    expect(PRODUCTS).toHaveLength(55);
    expect(LISTINGS).toHaveLength(16);
    // Her firmanın iki beyanı + her ürün + her talep kapıya veriliyor.
    expect(marketplaceDemoCategoryRefs()).toHaveLength(
      COMPANIES.reduce((n, c) => n + c.sell.length + c.buy.length, 0) + PRODUCTS.length + LISTINGS.length,
    );
  });

  it("hiçbir firma beyanı, ürün ya da talep gizli bir önekin (segment, aile, sınıf) altında değil", () => {
    expect(hiddenSeedCategoryRefs(marketplaceDemoCategoryRefs())).toEqual([]);
    expect(() => assertVisibleSeedCategories("seed-marketplace-demo", marketplaceDemoCategoryRefs())).not.toThrow();
    // Gizli beyanı düşen firma satıcı beyansız kalmadı (dizinde ve eşleştirmede görünür).
    for (const c of COMPANIES) {
      expect(c.sell.length).toBeGreaterThan(0);
      expect(c.buy.length).toBeGreaterThan(0);
      for (const code of [...c.sell, ...c.buy]) expect(code).toMatch(/^\d{2}000000$/); // ana eksen = segment
    }
  });

  it("eski gizli kodlu bir satır eklenirse kapı onu ADIYLA yakalar", () => {
    const withLegacy = [
      ...marketplaceDemoCategoryRefs(),
      { source: 'product "Av Tüfeği Kılıfı" (demir)', code: "46101800" },
      { source: "company antalya-tarim sell", code: "10000000" },
    ];
    expect(() => assertVisibleSeedCategories("seed-marketplace-demo", withLegacy)).toThrow(
      /46101800 {2}product "Av Tüfeği Kılıfı" \(demir\)\n {2}10000000 {2}company antalya-tarim sell/,
    );
  });

  // 46 geri açıldı (2026-10-10): baret / yangın ürünü demo verisine eklenebilir.
  it("görünür 46 kodlu bir satır (baret, yangın söndürücü) kapıdan geçer", () => {
    const withSafety = [
      ...marketplaceDemoCategoryRefs(),
      { source: 'product "Baret" (demir)', code: "46181700" },
      { source: 'product "Yangın Söndürücü" (demir)', code: "46191600" },
      { source: "company demir sell", code: "46000000" },
    ];
    expect(hiddenSeedCategoryRefs(withSafety)).toEqual([]);
    expect(() => assertVisibleSeedCategories("seed-marketplace-demo", withSafety)).not.toThrow();
  });

  it("nitelikler kategori matrisiyle uyuşuyor (assertAttrs yeşil)", () => {
    expect(demoAttrProblems()).toEqual([]);
  });

  it("kategorisi taşınan ürün ESKİ segmentin nitelikleriyle kalamaz (denetim gerçekten yakalıyor)", () => {
    // Gıda (50) nitelikleriyle gıda makinesine (23) taşınmış ürün: anahtarlar 23 zincirinde yok.
    const moved: Pr = {
      owner: "marmara", name: "Dolum Makinesi", cat: "23181501", desc: "x", unit: "adet", kw: [], img: "/categories/23000000.webp",
      attrs: { sertifika: ["HACCP"], saklama: "Oda sıcaklığı", durum: "Sıfır", kontrol: "Robot" },
    };
    expect(demoAttrProblems([moved])).toEqual([
      'Dolum Makinesi: "sertifika" niteliği 23181501 zincirinde tanımlı değil',
      'Dolum Makinesi: "saklama" niteliği 23181501 zincirinde tanımlı değil',
      'Dolum Makinesi: "kontrol" için geçersiz değer "Robot"',
    ]);
  });

  it("gizli segmentten taşınan firmaların ürünlerinde yeni kategorinin ZORUNLU nitelikleri dolu", () => {
    const moved = PRODUCTS.filter((p) => ["marmara", "baskent", "yildiz", "antalya-tarim", "kayseri-mobilya"].includes(p.owner));
    expect(moved).toHaveLength(14); // taşınan 13 ürün + yildiz'in baştan beri görünür A4 kağıdı
    const missing: string[] = [];
    for (const p of moved) {
      const defs = new Map<string, { key: string; required?: boolean }>();
      for (const code of [...categoryAncestors(p.cat), p.cat]) {
        for (const d of CATEGORY_ATTRIBUTES[code] ?? []) defs.set(d.key, d);
      }
      for (const d of defs.values()) {
        const v = p.attrs?.[d.key];
        if (d.required && (v == null || v === "" || (Array.isArray(v) && v.length === 0))) missing.push(`${p.name}: ${d.key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("ürün ve talep sahipleri, bağlantılar tanımlı firmalara bağlı; açıklamalar yayın kapısını geçer", () => {
    for (const p of PRODUCTS) {
      expect(keys.has(p.owner)).toBe(true);
      expect(p.desc.length).toBeGreaterThanOrEqual(100);
    }
    for (const l of LISTINGS) expect(keys.has(l.owner)).toBe(true);
    for (const [a, b] of CONNECTIONS) {
      expect(keys.has(a)).toBe(true);
      expect(keys.has(b)).toBe(true);
    }
  });

  it("her teklif TEK bir talebe bağlanır (betik bulamadığı teklifi sessizce atlar)", () => {
    for (const b of BIDS) {
      const hits = LISTINGS.filter((l) => l.owner === b.owner && l.title.includes(b.titleIncludes));
      expect({ bid: `${b.bidder} -> ${b.owner} "${b.titleIncludes}"`, hits: hits.length }).toEqual({
        bid: `${b.bidder} -> ${b.owner} "${b.titleIncludes}"`,
        hits: 1,
      });
      expect(keys.has(b.bidder)).toBe(true);
      expect(b.bidder).not.toBe(b.owner);
    }
  });

  it("görseller repoda var (assertPhotos yeşil)", () => {
    const photos = marketplaceDemoPhotos();
    expect(photos.length).toBeGreaterThan(10);
    expect(photos.filter((src) => !existsSync(join(WEB_PUBLIC, src)))).toEqual([]);
  });

  /**
   * R-SEED-01: kategorisi görünür segmente taşınan beş ürünün görseli gizli
   * segmentin fotoğrafında kalmıştı (kumaş → giyim 53, A4 kağıt → ofis 44,
   * WMS → BT 43). Web gizli segmentin fotoğrafını hiçbir yüzeyde vermez; kayda
   * yazılmış yol o süzgeçten geçmediği için herkese açık kartta çıkıyordu.
   */
  it("hiçbir ürün görseli ya da firma kapağı gizli segmentin fotoğrafı değil", () => {
    const refs = marketplaceDemoPhotoRefs();
    // Tarama boş değil: her ürünün görseli + her firmanın kapağı kapıya veriliyor.
    expect(refs).toHaveLength(PRODUCTS.length + COMPANIES.length);
    expect(hiddenSeedCategoryRefs(refs)).toEqual([]);
    expect(marketplaceDemoPhotos().filter((src) => isHiddenCategory(/(\d{8})\.webp$/.exec(src)?.[1]))).toEqual([]);
    // Betiğin kapıya verdiği listenin tamamı (kodlar + görseller) geçer.
    expect(() =>
      assertVisibleSeedCategories("seed-marketplace-demo", [...marketplaceDemoCategoryRefs(), ...refs]),
    ).not.toThrow();
  });

  it("görseli değişen beş ürün kendi segmentinin fotoğrafını taşır", () => {
    const img = (name: string) => PRODUCTS.find((p) => p.name.startsWith(name))?.img;
    for (const p of PRODUCTS.filter((x) => x.owner === "ege")) expect(p.img).toBe("/categories/11000000.webp");
    expect(PRODUCTS.filter((x) => x.owner === "ege")).toHaveLength(3);
    expect(img("Fotokopi Kağıdı A4")).toBe("/categories/14000000.webp");
    expect(img("Depo Yönetim Yazılımı (WMS)")).toBe("/categories/81000000.webp");
  });

  it("eski gizli segment fotoğraflı bir ürün eklenirse kapı onu ÜRÜN ADIYLA yakalar", () => {
    const legacy = seedPhotoCategoryRefs([
      { source: 'product "Polyester Astar Kumaş 60 g/m²" (ege)', src: "/categories/53000000.webp" },
    ]);
    expect(() =>
      assertVisibleSeedCategories("seed-marketplace-demo", [...marketplaceDemoCategoryRefs(), ...marketplaceDemoPhotoRefs(), ...legacy]),
    ).toThrow(/53000000 {2}product "Polyester Astar Kumaş 60 g\/m²" \(ege\) image \/categories\/53000000\.webp/);
  });
});

describe("staging demo verisi (seed-staging-demo)", () => {
  it("üç firma; seçimler ve ürünler gizli bir önekin altında değil", () => {
    expect(STAGING_COMPANIES.map((c) => c.key)).toEqual(["gold", "silver", "ucretsiz"]);
    const refs = stagingDemoCategoryRefs();
    expect(refs).toHaveLength(
      STAGING_COMPANIES.reduce((n, c) => n + c.sellPicks.length + c.buyPicks.length + c.products.length, 0),
    );
    expect(hiddenSeedCategoryRefs(refs)).toEqual([]);
  });

  it("ücretsiz demo firma gizli 52'den görünür 11'e taşındı; satış seçimi ve ürünleri var", () => {
    const free = STAGING_COMPANIES.find((c) => c.key === "ucretsiz")!;
    expect(free.sellPicks).toEqual(["11161700"]);
    expect(free.products).toHaveLength(3);
    for (const p of free.products) {
      expect(isHiddenCategory(p.cat)).toBe(false);
      expect(p.cat.slice(0, 2)).toBe("11");
      expect(p.desc.length).toBeGreaterThanOrEqual(100); // assertSpecs: yayın kapısı
    }
  });

  it("görseller repoda var", () => {
    expect(stagingDemoPhotos().filter((src) => !existsSync(join(WEB_PUBLIC, src)))).toEqual([]);
  });

  it("hiçbir ürün görseli ya da firma kapağı gizli segmentin fotoğrafı değil", () => {
    const refs = stagingDemoPhotoRefs();
    expect(refs).toHaveLength(STAGING_COMPANIES.reduce((n, c) => n + 1 + c.products.length, 0));
    expect(hiddenSeedCategoryRefs(refs)).toEqual([]);
    expect(stagingDemoPhotos().filter((src) => isHiddenCategory(/(\d{8})\.webp$/.exec(src)?.[1]))).toEqual([]);
  });
});

/**
 * KAYNAK TARAMASI — kapı yalnız mevcut dört betikte değil, firma/talep/ürün
 * kategorisi yazan HER betikte olmalı. Yeni bir seed kapıyı atlarsa burası kırmızı.
 */
describe("kategori yazan betikler kapıya bağlı", () => {
  /** Kataloğun KENDİSİNİ yazan betikler (kategori ve nitelik satırları): firma/ürün/talep kategorisi yazmazlar. */
  const CATALOG_ONLY = new Set([
    "seed-categories.ts",
    "seed-category-attributes.ts",
    "apply-category-attribute-names-i18n.ts",
    "export-category-attribute-names-i18n.ts",
  ]);
  const WRITES_CATEGORY = /\b(categoryIds?|\w+CategoryIds)\b/;
  const files = readdirSync(SCRIPTS).filter((f) => f.endsWith(".ts"));
  const writers = files.filter((f) => !CATALOG_ONLY.has(f) && WRITES_CATEGORY.test(read(f)));

  it("tarama dört demo betiğini buluyor", () => {
    expect(writers).toEqual(
      expect.arrayContaining(["add-anadolu-listing.ts", "seed-demo-fill.ts", "seed-marketplace-demo.ts", "seed-staging-demo.ts"]),
    );
  });

  it("kök seed (prisma/seed.ts) kategori yazmıyor; yazmaya başlarsa kapıya bağlanmalı", () => {
    const src = readFileSync(resolve(SCRIPTS, "../seed.ts"), "utf8");
    expect(src.length).toBeGreaterThan(0);
    expect(WRITES_CATEGORY.test(src) && !src.includes("seed-category-guard")).toBe(false);
  });

  it.each(writers)("%s: kapıyı içe aktarır ve yazımdan önce çağırır", (file) => {
    const src = read(file);
    expect(src).toContain('from "./lib/seed-category-guard"');
    expect(src).toMatch(/assertVisibleSeedCategor(y|ies)\(/);
  });

  it("görsel yazan iki demo betiği kapıya görselleri de verir (kodlarla aynı çağrı)", () => {
    expect(read("seed-marketplace-demo.ts")).toContain(
      "assertVisibleSeedCategories(SCRIPT, [...marketplaceDemoCategoryRefs(), ...marketplaceDemoPhotoRefs()]);",
    );
    expect(read("seed-staging-demo.ts")).toContain(
      "assertVisibleSeedCategories(SCRIPT, [...stagingDemoCategoryRefs(), ...stagingDemoPhotoRefs()]);",
    );
  });

  it.each(writers)("%s: her katalog sorgusu gizli segment süzgeci taşır", (file) => {
    const src = read(file);
    const calls = [...src.matchAll(/prisma\.category\.\w+\(/g)].map((m) => {
      // Çağrının tamamı: açılan parantezden dengeli kapanışa kadar.
      let depth = 0;
      let end = m.index! + m[0].length - 1;
      for (let i = end; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")" && --depth === 0) {
          end = i;
          break;
        }
      }
      const lineStart = src.lastIndexOf("\n", m.index!) + 1;
      return src.slice(lineStart, end + 1);
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // Ya `where` kapı modülünden gelir (FindSeedCategory adaptörü) ya da süzgeç çağrıda yazılıdır.
      expect(call).toMatch(/const findCat: FindSeedCategory = \(where\) => prisma\.category\.findFirst\(\{ where,|visibleActiveFamilyWhere\(\)|hiddenCategoryWhere\(\)/);
    }
  });

  it("betiklerde ve veri dosyalarında gizli bir önekin altında sabit kod kalmadı", () => {
    const sources = [...writers.map(read), read("lib/marketplace-demo-data.ts"), read("lib/staging-demo-data.ts")];
    const literals = sources.flatMap((src) => [...src.matchAll(/"(\d{8})"/g)].map((m) => m[1]!));
    expect(literals.length).toBeGreaterThan(100);
    expect([...new Set(literals.filter((code) => isHiddenCategory(code)))]).toEqual([]);
    // Görsel yolları tırnaklı 8 haneli kod DEĞİLDİR ("/categories/53000000.webp") —
    // yukarıdaki tarama onları görmez (R-SEED-01 böyle kaçmıştı); ayrıca taranır.
    const photoCodes = sources.flatMap((src) => [...src.matchAll(/\/categories\/(\d{8})\.webp/g)].map((m) => m[1]!));
    expect(photoCodes.length).toBeGreaterThan(50);
    expect([...new Set(photoCodes.filter((code) => isHiddenCategory(code)))]).toEqual([]);
  });
});

/**
 * MODEL İSTEMİ (2026-10-10 gözden geçirmesi). Çevrimdışı üreticiler her düğümü ADIYLA ve
 * üst yoluyla modele yollar. Gizli bir dalın adı hiçbir model istemine yazılmaz:
 * süzgeçsiz hâliyle `gen-category-keywords -- --segments 46` yeniden açılan
 * sektörün silah ve kolluk dallarını isteme koyuyordu.
 */
describe("model çağıran üretici betikler: gizli dalın düğümü isteme girmez", () => {
  /** `gen-category-keywords -- --segments 46` adayları: segment 46'nın L2-L4 düğümlerinden örnek. */
  const SEGMENT_46 = [
    { code: "46100000", nameTr: "Hafif silahlar ve mühimmat" },
    { code: "46101500", nameTr: "Ateşli silahlar" },
    { code: "46101501", nameTr: "Makineli tüfekler" },
    { code: "46150000", nameTr: "Kolluk ekipmanları" },
    { code: "46160000", nameTr: "Kamu güvenliği ve kontrolü" },
    { code: "46180000", nameTr: "Kişisel güvenlik ve koruma" },
    { code: "46181700", nameTr: "Yüz ve baş koruması" },
    { code: "46182500", nameTr: "Kişisel güvenlik cihazları veya silahları" },
    { code: "46182501", nameTr: "Biber gazı spreyleri" },
    { code: "46191600", nameTr: "Yangın söndürme ekipmanları" },
    { code: "46200000", nameTr: "Savunma ve kolluk eğitim ekipmanları" },
    { code: "46211700", nameTr: "Çalışma alanı güvenliği" },
    { code: "46220000", nameTr: "Askeri silah ve mühimmat imha" },
  ];

  it("visiblePromptNodes gizli aile ve sınıf düğümlerini düşürür; görünür düğüm sırasıyla ve aynı satırla kalır", () => {
    const kept = visiblePromptNodes(SEGMENT_46);
    expect(kept.map((n) => n.code)).toEqual(["46160000", "46180000", "46181700", "46191600", "46211700"]);
    expect(kept[0]).toBe(SEGMENT_46[4]);
    // İsteme girecek metinde gizli dalın ne kodu ne adı var.
    const prompt = kept.map((n) => `${n.code}\t${n.nameTr}`).join("\n");
    expect(prompt).not.toMatch(/46(1[0-5]|20|22)\d{4}|461825\d{2}/);
    for (const name of ["silah", "Kolluk", "Biber gazı", "eğitim ekipmanları"]) expect(prompt).not.toContain(name);
  });

  it("tümüyle gizli segmentin düğümü de düşer; gizli listenin HER öneki için çalışır", () => {
    const mixed = [{ code: "10101500" }, { code: "31161500" }, { code: "77101500" }, { code: "46000000" }];
    expect(visiblePromptNodes(mixed)).toEqual([{ code: "31161500" }, { code: "46000000" }]);
    expect(visiblePromptNodes([])).toEqual([]);
    const underEveryPrefix = HIDDEN_CATEGORY_PREFIXES.map((prefix) => ({ code: `${prefix}101500`.slice(0, 8) }));
    expect(underEveryPrefix.length).toBeGreaterThan(30);
    expect(visiblePromptNodes(underEveryPrefix)).toEqual([]);
  });

  /** Model çağıran HER betik (`lib/gemini` içe aktaran) kapıya bağlı; yeni bir üretici kapıyı atlarsa burası kırmızı. */
  const callers = readdirSync(SCRIPTS).filter((f) => f.endsWith(".ts") && read(f).includes('from "./lib/gemini"'));

  it("tarama iki üretici betiği buluyor", () => {
    expect([...callers].sort()).toEqual(["gen-category-keywords.ts", "gen-category-translations.ts"]);
  });

  it.each(callers)("%s: kapıyı içe aktarır; kapı tek gruplama noktasından ve model çağrısından önce", (file) => {
    const src = read(file);
    expect(src).toContain('import { visiblePromptNodes } from "./lib/seed-category-guard";');
    const gate = src.indexOf("visiblePromptNodes(");
    const batching = src.indexOf("batches.push(nodes.slice(");
    const call = src.indexOf("prompt: buildPrompt(batch),");
    expect(gate).toBeGreaterThan(-1);
    expect(batching).toBeGreaterThan(gate);
    expect(call).toBeGreaterThan(batching);
    // İsteme düğüm koyan tek yol bu: tek gruplama, tek istem kurma çağrısı.
    expect(src.match(/batches\.push\(/g)).toHaveLength(1);
    expect(src.match(/buildPrompt\(/g)).toHaveLength(2); // tanım + tek çağrı
  });

  it("gen-category-keywords: adaylar kapıdan geçer; gruplar ve yanıt eşlemesi yalnız adaylardan kurulur", () => {
    const src = read("gen-category-keywords.ts");
    expect(src).toContain("const candidates = visiblePromptNodes(rows);");
    expect(src).toContain("const nodes: Node[] = candidates");
    // Ad haritası süzülmüş listeden: model gizli bir kod uydursa da satırı yazılmaz.
    expect(src).toContain("const nameByCode = new Map(candidates.map((r) => [r.code, r.nameTr]));");
    expect(src).not.toMatch(/=\s*rows\s*\.(filter|map)\(|new Map\(rows\.map\(/);
  });

  it("gen-category-translations: düğüm listesi betikten kapıdan geçerek çıkar", () => {
    const src = read("gen-category-translations.ts");
    expect(src).toContain("return { nodes: visiblePromptNodes(nodes), limit };");
    expect(src.match(/return \{ nodes/g)).toHaveLength(1);
  });
});

/**
 * SAHİP KARARIYLA YENİDEN ADLANDIRILAN SEGMENT — tohum dosyaları (2026-10-10
 * gözden geçirmesi). 46, görünür olduğu anda "İş Güvenliği ve Yangın Ekipmanları"
 * adını taşımalıdır; eski adı ("Kolluk, …") sahibin anasayfadan kaldırttığı
 * addır. API adı `categories` tablosundan okur; ad tabloya bu dosyalardan gider
 * (`apply-category-translations`, `apply-category-names-i18n`,
 * `apply-category-keywords`, dağıtımdan sonra) ve görünürlükle aynı anda yerine
 * otursun diye ayrıca `20261010120000` veri migration'ıyla. Burası kaynağı, betiklerin okuduğu
 * işlevlerle kilitler: dosyalardan biri eski ada dönerse (ör. uygulanmamış bir
 * veritabanından `export-category-names-i18n -- --overwrite`) operatör adımı
 * eski adı görünür segmente geri yazardı.
 */
describe("46 yeniden adlandırıldı: tohum dosyaları yeni adı taşır (apply betiklerinin okuduğu hâliyle)", () => {
  const SEEDS = resolve(__dirname, "../../../../packages/db/src/seeds");
  const CODE = "46000000";
  const TR = "İş Güvenliği ve Yangın Ekipmanları";
  const OLD_TR = "Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları";
  /** Dosyada bu kodla başlayan satırlar (yorum satırları hariç). */
  const linesOf = (file: string) =>
    readFileSync(join(SEEDS, file), "utf8").split("\n").filter((line) => line.startsWith(`${CODE}\t`));

  it("TR ad (apply-category-translations); Ariba kaynağı aramaya KATILMAZ; yeni ad tekil, eski ad hiçbir kodun adı değil", () => {
    const translations = readTranslations(SEEDS);
    // 3. sütun bilinçli boş: Ariba'daki ad ("Law Enforcement and National Security …")
    // gizli dalların konusu; kaynak sütunu anahtar kelimelere katıldığı için yazılmaz.
    expect(translations.get(CODE)).toEqual({ tr: TR, source: "" });
    const names = [...translations.values()].map((t) => t.tr);
    expect(names.length).toBeGreaterThan(10_000); // tarama boş değil
    expect(names.filter((name) => name === TR)).toHaveLength(1);
    expect(names).not.toContain(OLD_TR);
  });

  it("EN / RU ad (apply-category-names-i18n)", () => {
    expect(readI18nNames(SEEDS).get(CODE)).toEqual({
      en: "Workplace Safety and Fire Equipment",
      ru: "Средства охраны труда и противопожарное оборудование",
    });
  });

  it("görünür aileleri EN / RU adsız değil (sektör açıldığında /en ve /ru boş kalmaz)", () => {
    const names = readI18nNames(SEEDS);
    for (const family of ["46160000", "46170000", "46180000", "46190000", "46210000"]) {
      expect(isHiddenCategory(family)).toBe(false);
      expect({ family, en: !!names.get(family)?.en, ru: !!names.get(family)?.ru }).toEqual({ family, en: true, ru: true });
    }
  });

  it("her dosyada kodun TEK satırı var (sonraki satır kazanır; eski adlı satır geride kalmaz)", () => {
    for (const file of ["category-translations.curated.tsv", "category-names.i18n.tsv", "category-keywords.tsv"]) {
      expect({ file, lines: linesOf(file).length }).toEqual({ file, lines: 1 });
    }
    // Elle yazılan çeviri dosyasının tamamında yinelenen kod yok (yeniden adlandırma eski satırı SİLEREK yapılır).
    const codes = readFileSync(join(SEEDS, "category-translations.curated.tsv"), "utf8")
      .split("\n")
      .filter((line) => /^\d{8}\t/.test(line))
      .map((line) => line.slice(0, 8));
    expect(codes.length).toBeGreaterThan(10_000);
    const seen = new Set<string>();
    expect(codes.filter((code) => seen.size === seen.add(code).size)).toEqual([]);
  });

  it("arama metni yeni adın terimlerini üç dilde taşır (apply-category-keywords)", () => {
    const keywords = buildKeywordsByCode(SEEDS).byCode.get(CODE) ?? "";
    for (const term of ["iş güvenliği", "yangın", "workplace safety", "fire protection", "охрана труда"]) {
      expect(keywords).toContain(term);
    }
  });

  it("eski kolluk / silah adı görünür sektörün anahtar kelimelerinde YOK ('law enforcement' sektörü bulmaz)", () => {
    const keywords = (buildKeywordsByCode(SEEDS).byCode.get(CODE) ?? "").toLocaleLowerCase("en");
    for (const term of ["law enforcement", "national security", "kolluk", "silah", "weapon", "defense", "defence"]) {
      expect({ term, present: keywords.includes(term) }).toEqual({ term, present: false });
    }
  });
});

/**
 * 46'NIN GÖRÜNÜR DALLARI — EŞ ANLAMLI SATIRLARI (2026-10-10).
 *
 * Sektör, eş anlamlılar üretilirken gizliydi: üretilen dosyada 46 satırı yok ve
 * aileleri / sınıfları gündelik sözcükle bulunamıyordu ("kkd", "isg", "ppe",
 * "çelik burunlu", "yangın tüpü" → sonuç yok). Sektör satırı seçicilerde yalnız
 * ADIYLA eşleşir (`categoryNameMatchesAll`): 46000000 satırındaki sözcükler
 * aileleri buldurmaz, aile ve sınıf KENDİ satırından bulunur. Satırlar elle
 * yazıldı (`category-keywords.tsv`).
 *
 * Kilitlenenler: (1) görünür her aile ve sınıfın satırı var; (2) gizli bir
 * önekin altındaki koda satır YOK — iki dosyada da; (3) 46 altındaki hiçbir
 * satırda silah / askeri / kolluk sözcüğü yok (yukarıda 46000000 için duran
 * kilidin bütün satırlara ve betiklerin tabloya yazdığı bileşik değere
 * genişletilmiş hâli); (4) gündelik sözcükler doğru dalın satırında.
 * Gerçek arama (servis + Postgres): integration `seed-scripts-hidden-category.spec`.
 */
describe("46 görünür dalları: eş anlamlı satırları (elle yazılan + üretilen)", () => {
  const SEEDS = resolve(__dirname, "../../../../packages/db/src/seeds");
  const SECTOR = "46000000";
  const FAMILIES = ["46160000", "46170000", "46180000", "46190000", "46210000"];
  const CLASSES = [
    ...["46161500", "46161600", "46161700"], // trafik kontrol, su güvenliği, kurtarma
    ...["46171500", "46171600", "46171700"], // kilitler, gözetleme ve tespit, araç geçişi
    ...["46181500", "46181600", "46181700", "46181800", "46181900", "46182000", "46182100", "46182200", "46182300", "46182400"],
    ...["46191500", "46191600"], // yangın önleme, yangınla mücadele
    ...["46211500", "46211600", "46211700"], // iş güvenliği eğitimi, alan işaretleme, alan güvenliği
  ];
  /** KKD sınıfları: giysi, ayak, baş / yüz, göz, kulak, solunum, düşmeye karşı koruma. */
  const PPE_CLASSES = ["46181500", "46181600", "46181700", "46181800", "46181900", "46182000", "46182300"];

  type KeywordRow = { file: string; code: string; keywords: string };
  /** Sözlük dosyasının 46 satırları, betiklerin okuduğu biçimde (yorum ve boş satır atılır: `readTwoColumnTsv`). */
  const rowsOf = (file: string): KeywordRow[] =>
    readFileSync(join(SEEDS, file), "utf8")
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => line.split("\t"))
      .filter(([code]) => (code ?? "").trim().startsWith("46"))
      .map(([code, keywords]) => ({ file, code: (code ?? "").trim(), keywords: (keywords ?? "").trim() }));
  const handWritten = rowsOf("category-keywords.tsv");
  const generated = rowsOf("category-keywords.generated.tsv");
  const allRows = [...generated, ...handWritten];
  /** Kaynak katalogdaki 46 satırları: kod → düzey. */
  const catalog46 = new Map(
    readFileSync(join(SEEDS, "ariba-categories.tsv"), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("46"))
      .map((line) => line.split("\t"))
      .map(([code, level]) => [code ?? "", Number(level)] as const),
  );
  /** Betiklerin tabloya yazdığı değer: sözlük satırı + düşen adlar + çevrilen adın Ariba kaynağı. */
  const composed = buildKeywordsByCode(SEEDS).byCode;

  /** Sözcük başı / sonu, harf ve rakama göre (`\b` Türkçe ve Kiril harfte çalışmaz). */
  const START = "(?<![\\p{L}\\p{N}])";
  const END = "(?![\\p{L}\\p{N}])";
  /**
   * Sözcük BAŞINDA aranır; çekim eki sonda kalır (silahlar, tüfeği, оружия). Başka anlamı gündelik
   * olan sözcükler bilinçli YOK: "kelepçe" (hortum / kablo kelepçesi), "fişek" (işaret fişeği).
   */
  const STEMS = [
    // tr: silah ve mühimmat
    ...["silah", "tabanca", "tüfek", "tüfeğ", "mühimmat", "mermi", "bomba", "patlayıcı", "füze", "roket", "mayın"],
    // tr: askeri ve kolluk (gizli dalların konusu: kalabalık kontrol, adli ekipman, kişisel savunma)
    ...["asker", "savaş", "savunma", "kolluk", "jandarma", "zabıta", "çevik kuvvet", "zırh", "kurşun geçirmez"],
    ...["balistik", "taktik", "biber gazı", "adli"],
    // en
    ...["weapon", "firearm", "rifle", "pistol", "ammunition", "explosive", "missile", "grenade", "military", "police"],
    ...["law enforcement", "national security", "defense", "defence", "handcuff", "armor", "armour", "ballistic", "tactical"],
    ...["bulletproof", "bullet proof", "pepper spray", "forensic", "crowd control"],
    // ru
    ...["оруж", "боеприпас", "пистолет", "винтовк", "военн", "армейск", "полиц", "правоохран", "оборон", "бронежилет"],
    ...["взрывчат", "ракет", "гранат", "наручник", "дубинк"],
  ];
  /**
   * Yalnız TAM sözcük (yazılı çekimleriyle): kısa ya da masum bir sözcüğün başı olan terimler —
   * "çöp" katlanınca "cop", "gün" katlanınca "gun" olur; "polisaj", "polistiren" ve "bombeli" bu
   * sözcüklerle başlar ama silah / kolluk sözcüğü değildir.
   */
  const WORDS = [
    ...["cop", "copu", "copun", "coplar", "copları", "polis", "polisi", "polisin", "polise", "polisler", "polisleri"],
    ...["gun", "guns", "bomb", "bombs", "ammo", "army", "riot", "baton", "batons", "taser", "stun"],
    ...["армия", "армии", "армию", "армией"],
  ];
  const WEAPON_PATTERNS: Array<[string, RegExp]> = [
    ...STEMS.map((term): [string, RegExp] => [term, new RegExp(START + term, "u")]),
    ...WORDS.map((term): [string, RegExp] => [term, new RegExp(START + term + END, "u")]),
  ];
  /** Metinde geçen silah / askeri / kolluk terimleri. Büyük harf iki kuralla da küçültülür (I → ı ve I → i). */
  const weaponTerms = (text: string): string[] => {
    const haystack = `${text.toLocaleLowerCase("tr")}\n${text.toLocaleLowerCase("en")}`;
    return WEAPON_PATTERNS.filter(([, pattern]) => pattern.test(haystack)).map(([term]) => term);
  };

  /**
   * Sorgunun HER kelimesi satırın bileşik değerinde geçiyor mu: aramanın "yazılan biçim" süzgecinin
   * sözlük payı (servisle aynı iki işlev, `tokenizeQuery` + `foldSearchText`; kategori ADI burada sayılmaz).
   */
  const rowsFinding = (query: string): string[] => {
    const tokens = tokenizeQuery(query).map((token) => foldSearchText(token));
    return [...FAMILIES, ...CLASSES]
      .filter((code) => {
        const text = foldSearchText(composed.get(code) ?? "");
        return tokens.length > 0 && tokens.every((token) => text.includes(token));
      })
      .sort();
  };

  it("katalog: 46'nın görünür 5 ailesi ve 21 sınıfı kaynaktan türetilir (gizli dallar düşer)", () => {
    const upper = [...catalog46].filter(([, level]) => level === 2 || level === 3).map(([code]) => code);
    const visible = upper.filter((code) => !isHiddenCategory(code));
    expect(visible.sort()).toEqual([...FAMILIES, ...CLASSES].sort());
    expect(FAMILIES).toHaveLength(5);
    expect(CLASSES).toHaveLength(21);
    // Tarama gizli dalları da görüyor (8 aile + sınıfları): süzen `isHiddenCategory`, boş bir liste değil.
    expect(upper.length - visible.length).toBeGreaterThan(20);
  });

  it("görünür her aile ve sınıfın ELLE yazılmış satırı var; kod yinelenmez, satır boş değil", () => {
    const codes = handWritten.map((row) => row.code);
    expect([SECTOR, ...FAMILIES, ...CLASSES].filter((code) => !codes.includes(code))).toEqual([]);
    // Aynı kodun ikinci satırı ilkini sessizce ezer (sonraki satır kazanır).
    expect(codes.filter((code, index) => codes.indexOf(code) !== index)).toEqual([]);
    // Sözcüksüz satırı betik sessizce atlar; kod "sözlüklü" görünür ama tabloya bir şey yazılmaz.
    expect(handWritten.filter((row) => !row.keywords).map((row) => row.code)).toEqual([]);
  });

  it("gizli bir önekin altındaki koda satır YOK (elle + üretilen); her satırın kodu katalogda", () => {
    expect(allRows.length).toBeGreaterThan(20); // tarama boş değil
    expect(allRows.filter((row) => isHiddenCategory(row.code)).map((row) => `${row.file}: ${row.code}`)).toEqual([]);
    // Katalogda olmayan kod (yazım hatası) betikte sessizce atlanır ("kod DB'de yok"); burada görünür.
    expect(allRows.filter((row) => !catalog46.has(row.code)).map((row) => `${row.file}: ${row.code}`)).toEqual([]);
    // Süzgeç gerçekten ayırır: gizli aile, gizli sınıf ve yaprağı yakalanır; görünür komşuları geçer.
    expect(["46101500", "46150000", "46182500", "46182501", "46180000", "46181500"].filter((code) => isHiddenCategory(code))).toEqual([
      "46101500",
      "46150000",
      "46182500",
      "46182501",
    ]);
  });

  it("silah / askeri / kolluk sözcüğü 46 altındaki HİÇBİR satırda yok (elle + üretilen + tabloya yazılan değer)", () => {
    expect(allRows.flatMap((row) => weaponTerms(row.keywords).map((term) => `${row.file}: ${row.code}: ${term}`))).toEqual([]);
    // Tabloya yazılan bileşik değer: sektör, görünür aileler ve sınıflar (düşen adlar + Ariba kaynağı dahil).
    const written = [SECTOR, ...FAMILIES, ...CLASSES];
    for (const code of written) expect(composed.get(code)).toBeTruthy();
    expect(written.flatMap((code) => weaponTerms(composed.get(code) ?? "").map((term) => `${code}: ${term}`))).toEqual([]);
    // "kolluk" alt dizgi olarak da yok: arama alt dizgiyle eşleşir ve bu sözcük 46 altında yalnız ADI
    // "Güvenlik kollukları" olan yaprağı (46181516) bulmalıdır.
    expect(allRows.filter((row) => foldSearchText(row.keywords).includes("kolluk")).map((row) => row.code)).toEqual([]);
  });

  it("kilit gerçekten yakalar: üç dilde silah / askeri / kolluk sözcüğü işaretlenir, benzeyen masum sözcük geçer", () => {
    const flagged = [
      ...["silahlar", "av tüfeği", "tabanca kılıfı", "mühimmat", "kolluk ekipmanları", "güvenlik kollukları", "polis copu"],
      ...["askeri bot", "kurşun geçirmez yelek", "SILAH", "weapons", "Law Enforcement", "national security", "military boots"],
      ...["gun", "police", "defense", "оружие", "военная форма", "полицейский"],
    ];
    expect(flagged.filter((text) => weaponTerms(text).length === 0)).toEqual([]);
    const innocent = [
      ...["kollu bariyer", "çöp kovası", "günlük bakım", "emniyet kemeri", "alarm sistemi", "bombeli sac", "mermer"],
      ...["polisaj", "polistiren", "copper pipe", "burgundy", "armature", "охрана труда", "оборудование"],
    ];
    expect(innocent.filter((text) => weaponTerms(text).length > 0)).toEqual([]);
  });

  it.each<[string, string[]]>([
    ["kkd", ["46180000", ...PPE_CLASSES]],
    ["ppe", ["46180000", ...PPE_CLASSES]],
    ["сиз", ["46180000", ...PPE_CLASSES]],
    ["kişisel koruyucu donanım", ["46180000"]],
    ["isg", ["46180000", "46210000", "46211500", "46211600", "46211700"]],
    ["iş sağlığı ve güvenliği", ["46180000", "46210000", "46211500"]],
    ["iş ayakkabısı", ["46181600"]],
    ["çelik burunlu", ["46181600"]],
    ["iş eldiveni", ["46181500"]],
    ["reflektörlü yelek", ["46181500"]],
    ["toz maskesi", ["46182000"]],
    ["emniyet kemeri", ["46182300"]],
    ["yangın tüpü", ["46191600"]],
    ["yangın dolabı", ["46191600"]],
  ])("gündelik sözcük doğru dalın satırında: %s", (query, codes) => {
    expect(rowsFinding(query)).toEqual([...codes].sort());
  });

  it("elle yazılan 46 satırları sözlük biçiminde: küçük harf, yalnız harf / rakam, tek boşluk", () => {
    expect(handWritten.length).toBeGreaterThan(20);
    for (const row of handWritten) {
      expect({ code: row.code, lowerCase: row.keywords === row.keywords.toLocaleLowerCase("tr") }).toEqual({ code: row.code, lowerCase: true });
      expect({ code: row.code, plain: /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(row.keywords) }).toEqual({ code: row.code, plain: true });
    }
  });
});

describe("cleanup-categories tarihsel: ikinci gizleme/adlandırma kaynağı değil", () => {
  const src = read("cleanup-categories.ts");

  it("kendi gizli listesi yok; segmentleri ve gizli dalları paylaşılan kaynaktan okur", () => {
    expect(src).toMatch(
      /import \{ HIDDEN_BRANCH_PREFIXES, HIDDEN_SEGMENTS, hiddenPrefixesUnder, isHiddenCategory \} from "@rothern\/shared"/,
    );
    expect(src).not.toMatch(/HIDE_SEGMENT_CODES|HIDE_FAMILY_CODES|RENAME_MAP/);
    // Görünür segmentin gizli dalları rapora paylaşılan yardımcıdan gelir (elle önek listesi yok).
    expect(src).toContain("hiddenPrefixesUnder(seg.code)");
    expect(src.match(/"\d{4}"|"\d{6}"/g)).toBeNull();
    // Betikte tırnaklı 8 haneli kod (gizleme ya da yeniden adlandırma listesi) kalmadı.
    expect(src.match(/"\d{8}"/g)).toBeNull();
  });

  it("veritabanına yazmaz; --apply bağlantı kurulmadan reddedilir", () => {
    expect(src).not.toMatch(/\.(update|updateMany|create|createMany|delete|deleteMany|upsert)\(|\$executeRaw|\$executeRawUnsafe/);
    const refuse = src.indexOf('process.argv.includes("--apply")');
    const exit = src.indexOf("process.exit(1)", refuse);
    const client = src.indexOf("new PrismaClient(");
    expect(refuse).toBeGreaterThan(-1);
    expect(exit).toBeGreaterThan(refuse);
    expect(client).toBeGreaterThan(exit);
  });
});

describe("apply-category-keywords --dry (kardeş betiklerle aynı bayrak)", () => {
  it("bayrak okunur ve kuru çalışma dalı İLK yazımdan önce döner", () => {
    const src = read("apply-category-keywords.ts");
    const flag = src.indexOf('const dry = process.argv.includes("--dry")');
    const branch = src.indexOf("if (dry) {");
    const write = src.indexOf("prisma.$executeRaw");
    expect(flag).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(flag);
    expect(src.slice(branch, write)).toContain("return;");
    expect(write).toBeGreaterThan(branch);
  });
});

/**
 * `export-category-names-i18n` çeviri dosyasını veritabanından yeniden yazar.
 * Dosya elle düzeltildikten sonra (2026-10-09: 78000000 → "Logistics") henüz
 * `apply-category-names-i18n` koşulmamış bir veritabanına karşı çalıştırılırsa
 * eski adı sessizce dosyaya geri koyuyordu.
 */
describe("export-category-names-i18n üzerine yazma koruması", () => {
  const FILE = new Map([
    ["31161500", { en: "Screws", ru: "Винты" }],
    ["46181700", { en: "Face and head protection", ru: "Защита лица и головы" }], // eski kayıt kodu; DB'de EN/RU yok
    ["78000000", { en: "Logistics", ru: "Логистика" }],
    ["81141601", { en: "Logistics management", ru: "Управление логистикой" }],
  ]);
  /** Yeniden adlandırma UYGULANMAMIŞ veritabanı: 78000000 hâlâ eski adında. */
  const OLDER_DB = toI18nExportRows([
    { code: "81141601", nameEn: "Logistics management", nameRu: "Управление логистикой" },
    { code: "78000000", nameEn: "Transportation and Storage and Mail Services", nameRu: "Транспортные, складские и почтовые услуги" },
    { code: "31161500", nameEn: "Screws", nameRu: "Винты" },
    { code: "30191500", nameEn: "Scaffolding", nameRu: "Строительные леса" },
  ]);

  it("fark: değişen, düşen, yeni ve aynı satırları ayırır", () => {
    const diff = diffI18nNameExport(FILE, OLDER_DB);
    expect(diff.unchanged).toBe(2);
    expect(diff.changed).toEqual([
      {
        code: "78000000",
        file: { en: "Logistics", ru: "Логистика" },
        db: { en: "Transportation and Storage and Mail Services", ru: "Транспортные, складские и почтовые услуги" },
      },
    ]);
    expect(diff.dropped).toEqual([{ code: "46181700", en: "Face and head protection", ru: "Защита лица и головы" }]);
    expect(diff.added).toEqual([{ code: "30191500", en: "Scaffolding", ru: "Строительные леса" }]);
    expect(exportOverwritesFile(diff)).toBe(true);
  });

  it("eski adlı veritabanından dışa aktarım bayraksız YAZILMAZ; --dry yalnız özet, --overwrite yazar", () => {
    const diff = diffI18nNameExport(FILE, OLDER_DB);
    expect(planI18nNameExport(diff, { dry: false, overwrite: false })).toBe("refuse");
    expect(planI18nNameExport(diff, { dry: true, overwrite: false })).toBe("dry");
    expect(planI18nNameExport(diff, { dry: true, overwrite: true })).toBe("dry");
    expect(planI18nNameExport(diff, { dry: false, overwrite: true })).toBe("write");
  });

  it("yalnız YENİ satır ekleyen dışa aktarım (toplu çeviri sonrası) onaysız yazılır; fark yoksa dokunulmaz", () => {
    const sameRows = [...FILE].map(([code, n]) => ({ code, ...n }));
    const onlyNew = diffI18nNameExport(FILE, [...sameRows, { code: "30191500", en: "Scaffolding", ru: null }]);
    expect(exportOverwritesFile(onlyNew)).toBe(false);
    expect(planI18nNameExport(onlyNew, { dry: false, overwrite: false })).toBe("write");
    const same = diffI18nNameExport(FILE, sameRows);
    expect(same).toEqual({ unchanged: 4, added: [], changed: [], dropped: [] });
    expect(planI18nNameExport(same, { dry: false, overwrite: false })).toBe("noop");
    expect(planI18nNameExport(same, { dry: false, overwrite: true })).toBe("noop");
  });

  it("özet operatöre dosyadaki ve veritabanındaki adı yan yana gösterir", () => {
    const lines = formatI18nExportDiff(diffI18nNameExport(FILE, OLDER_DB));
    expect(lines[0]).toBe("diff (file -> database export): 2 unchanged, 1 new, 1 changed, 1 dropped");
    expect(lines).toContain(
      "  78000000  file: Logistics | Логистика  ->  db: Transportation and Storage and Mail Services | Транспортные, складские и почтовые услуги",
    );
    expect(lines).toContain("  46181700  Face and head protection | Защита лица и головы");
    expect(lines).toContain("  30191500  Scaffolding | Строительные леса");
  });

  it("hücre temizliği ve satır sırası: sekme/satır sonu boşluk olur, boş satır atılır, kod sırası", () => {
    expect(cleanI18nCell(" Screws\t\n ")).toBe("Screws");
    expect(cleanI18nCell("  ")).toBeNull();
    expect(cleanI18nCell(null)).toBeNull();
    expect(
      toI18nExportRows([
        { code: "31161500", nameEn: "Screws\tand\nbolts", nameRu: null },
        { code: "11000000", nameEn: null, nameRu: " Металлы " },
        { code: "20000000", nameEn: " ", nameRu: null },
      ]),
    ).toEqual([
      { code: "11000000", en: null, ru: "Металлы" },
      { code: "31161500", en: "Screws and bolts", ru: null },
    ]);
  });

  it("elle düzenlenmiş dosya başlığı korunur; dosya ya da başlık yoksa varsayılan", () => {
    const fallback = ["# varsayılan"];
    expect(leadingCommentBlock("# bir\n# iki\n11000000\tMetals\tМеталлы\n# satır arası\n", fallback)).toEqual(["# bir", "# iki"]);
    expect(leadingCommentBlock(null, fallback)).toEqual(fallback);
    expect(leadingCommentBlock("11000000\tMetals\tМеталлы\n", fallback)).toEqual(fallback);
  });

  it("betik kararı tek işlevden alır ve dosyayı yalnız 'write' kararında yazar", () => {
    const src = read("export-category-names-i18n.ts");
    const plan = src.indexOf("planI18nNameExport(diff, flags)");
    const refuse = src.indexOf('if (action === "refuse")');
    const write = src.indexOf("fs.writeFileSync(");
    expect(plan).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(plan);
    expect(write).toBeGreaterThan(refuse);
    expect(src.match(/writeFileSync\(/g)).toHaveLength(1);
    for (const action of ["dry", "noop", "refuse"]) {
      const at = src.indexOf(`if (action === "${action}")`);
      expect(src.slice(at, write)).toContain("return;");
    }
  });
});
