import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HIDDEN_SEGMENTS, categoryAncestors, isHiddenCategory } from "@rothern/shared";
import { CATEGORY_ATTRIBUTES } from "../../../../packages/db/src/seeds/category-attributes";
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
} from "../../../../packages/db/prisma/scripts/lib/seed-category-guard";
import {
  COMPANIES as STAGING_COMPANIES,
  stagingDemoCategoryRefs,
  stagingDemoPhotoRefs,
  stagingDemoPhotos,
} from "../../../../packages/db/prisma/scripts/lib/staging-demo-data";

/**
 * SEED BETİKLERİ GİZLİ SEGMENTE YAZMAZ (2026-10-09, kullanıcı: "anasayfada
 * olmayan kategori talepte, üründe ya da başka yerde de gösterilmesin").
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
  // Eski (legacy) kayıt kodları: 46 ve 77 2026-10-09'da, 10 2026-09-19'da gizlendi.
  const LEGACY = [
    { source: "legacy listing ROT-000834", code: "46181500" },
    { source: "legacy product", code: "10101500" },
    { source: "legacy company declaration", code: "77000000" },
  ];
  const VISIBLE = [
    { source: "product", code: "31161500" },
    { source: "company sell", code: "78000000" },
  ];

  it("gizli segmentteki kodları ayıklar; görünür kod ve boş liste geçer", () => {
    expect(hiddenSeedCategoryRefs([...VISIBLE, ...LEGACY])).toEqual(LEGACY);
    expect(() => assertVisibleSeedCategories("seed-x", VISIBLE)).not.toThrow();
    expect(() => assertVisibleSeedCategories("seed-x", [])).not.toThrow();
    expect(assertVisibleSeedCategory("seed-x", "product", "31161500")).toBe("31161500");
  });

  it("tek bir gizli kodda DURUR; ileti betiği, kodu ve yerini söyler (ASCII)", () => {
    let message = "";
    try {
      assertVisibleSeedCategories("seed-x", [...VISIBLE, ...LEGACY]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("[seed-x] 3 seed category code(s) sit under a hidden segment (HIDDEN_SEGMENTS)");
    expect(message).toContain("46181500  legacy listing ROT-000834");
    expect(message).toContain("10101500  legacy product");
    expect(message).toContain("77000000  legacy company declaration");
    expect(message).not.toContain("31161500");
    expect(message).toMatch(/^[\x20-\x7E\n]+$/);
    expect(() => assertVisibleSeedCategory("seed-x", "listing category", "46181700")).toThrow(/46181700 {2}listing category/);
  });

  it("gizli segment listesinin HER öneki için çalışır (tek kaynak HIDDEN_SEGMENTS)", () => {
    for (const prefix of HIDDEN_SEGMENTS) {
      expect(() => assertVisibleSeedCategory("seed-x", "any", `${prefix}101500`)).toThrow(/hidden segment/);
    }
  });

  /**
   * GÖRSEL DE KAPIDAN GEÇER (gözden geçirme R-SEED-01). Demo görseli kategori
   * fotoğrafıdır; gizli segmentin fotoğrafı (46 = kolluk/emniyet, 10 = canlı
   * bitki) o kategoriyi adını yazmadan gösterir.
   */
  it("görsel yolu segment koduna çevrilir; gizli segmentin fotoğrafı kodla AYNI kapıda durur", () => {
    const refs = seedPhotoCategoryRefs([
      { source: 'product "Baret" (demir)', src: "/categories/46000000.webp" },
      { source: "company antalya-tarim cover", src: "/categories/10000000.webp" },
      { source: 'product "Cıvata" (demir)', src: "/categories/31000000.webp" },
    ]);
    expect(refs).toEqual([
      { source: 'product "Baret" (demir) image /categories/46000000.webp', code: "46000000" },
      { source: "company antalya-tarim cover image /categories/10000000.webp", code: "10000000" },
      { source: 'product "Cıvata" (demir) image /categories/31000000.webp', code: "31000000" },
    ]);
    expect(hiddenSeedCategoryRefs(refs).map((r) => r.code)).toEqual(["46000000", "10000000"]);
    expect(() => assertVisibleSeedCategories("seed-x", refs)).toThrow(
      /46000000 {2}product "Baret" \(demir\) image \/categories\/46000000\.webp\n {2}10000000 {2}company antalya-tarim cover image/,
    );
    expect(() => assertVisibleSeedCategories("seed-x", refs.slice(2))).not.toThrow();
  });

  it("kategori fotoğrafı olmayan görsel (yüklenmiş dosya, dış adres) başvuru üretmez", () => {
    expect(
      seedPhotoCategoryRefs([
        { source: "uploaded", src: "https://cdn.example.com/tenant-profile/c1/urun.webp" },
        { source: "not a segment file", src: "/categories/46.webp" },
        { source: "other folder", src: "/hero/46000000.webp" },
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

  it("hiçbir firma beyanı, ürün ya da talep gizli segmentte değil", () => {
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
      { source: 'product "Baret" (demir)', code: "46181700" },
      { source: "company antalya-tarim sell", code: "10000000" },
    ];
    expect(() => assertVisibleSeedCategories("seed-marketplace-demo", withLegacy)).toThrow(
      /46181700 {2}product "Baret" \(demir\)\n {2}10000000 {2}company antalya-tarim sell/,
    );
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
  it("üç firma; seçimler ve ürünler gizli segmentte değil", () => {
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

  it("betiklerde ve veri dosyalarında gizli segmente ait sabit kod kalmadı", () => {
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

describe("cleanup-categories tarihsel: ikinci gizleme/adlandırma kaynağı değil", () => {
  const src = read("cleanup-categories.ts");

  it("kendi segment listesi yok; gizli segmentleri HIDDEN_SEGMENTS'ten okur", () => {
    expect(src).toMatch(/import \{ HIDDEN_SEGMENTS, isHiddenCategory \} from "@rothern\/shared"/);
    expect(src).not.toMatch(/HIDE_SEGMENT_CODES|HIDE_FAMILY_CODES|RENAME_MAP/);
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
