/**
 * SEED BETİKLERİNİN KATALOG SORGULARI GİZLİ KATEGORİYE DÜŞMEZ (2026-10-09) —
 * gerçek Postgres + gerçek Prisma `where`.
 *
 * 2026-10-10: gizliliğin birimi kod ÖNEKİ. 46 "İş Güvenliği ve Yangın
 * Ekipmanları" adıyla açık; altındaki silah / kolluk aileleri (4610 …) ve
 * 461825 sınıfı gizli. Görünür segmentin içinde gezen yedekler ("segmentin ilk
 * sınıfı", segment içi ad eşleşmesi, aile havuzu) o dallara da inemez.
 *
 * Demo betikleri kategori kodunu katalogdan ÇÖZER: kod yoksa anahtar kelimeyle
 * en yakın sınıfa, o da yoksa segmentin ilk sınıfına düşer. Süzgeçsiz hâliyle
 * yedek gizli segmente inebiliyordu ("masa" → 42192000, "gümrük" → 93171700),
 * `seed-demo-fill` kod sırasız ilk 24 aileyi alıyor (hepsi segment 10) ve
 * `add-anadolu-listing` ad eşleşmesiyle gizli bir aileyi seçebiliyordu. Gizli
 * daldaki kayıtlar DURUR (eski ürün/talep); seed onlara yenisini eklemez.
 *
 * İkinci kısım `apply-category-keywords -- --dry`: bayrak yokken betik `--dry`yi
 * yok sayıp hemen yazıyordu. Betik çocuk süreçte, YALNIZ bu testin veritabanına
 * karşı koşar (hedef satırı denetlenir).
 *
 * Üçüncü kısım `gen-category-keywords`: eş anlamlı üreticisi düğümleri kategori
 * tablosundan seçip adlarıyla modele yollar; gizli bir dalın düğümü aday olmaz.
 * `--limit 0` ile koşar — hiçbir grup modele gitmez, yalnız aday sayısı basılır.
 *
 * Dördüncü kısım 46'nın yeni adı: ad tabloya yalnız operatör betikleriyle gider
 * (`apply-category-translations` + `apply-category-names-i18n`); betikler eski
 * adlı satırı yeni ada çevirir ve ikinci koşuda hiçbir şey yazmaz.
 *
 * Beşinci kısım 46'nın eş anlamlıları: sektörün görünür aileleri ve sınıfları
 * tohum dosyalarındaki satırlarla kurulur ve GERÇEK arama koşulur — gündelik
 * sözcük ("kkd", "çelik burunlu", "yangın tüpü") doğru dalı bulur; silah /
 * kolluk sözcüğü 46 altında hiçbir şey bulmaz.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  categorySearchText,
  categorySubtreeMatcher,
  categorySubtreeWhere,
  foldSearchText,
  hiddenCategoryWhere,
  hiddenPrefixesUnder,
} from "@rothern/shared";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import { CategoryService } from "../../src/modules/categories/services/category.service";
import { buildKeywordsByCode, readI18nNames, readTranslations } from "../../../../packages/db/prisma/scripts/lib/category-keywords";
import {
  existingVisiblePick,
  resolveVisibleDiscoveryCategory,
  visibleActiveFamilyWhere,
  visibleSegmentOf,
  type FindSeedCategory,
  type SeedCategoryWhere,
} from "../../../../packages/db/prisma/scripts/lib/seed-category-guard";
import { TEST_DB_URL } from "./env";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

/** Betiklerdeki adaptörün AYNISI (`findCat`): `where` kapı modülünden gelir. */
const calls: SeedCategoryWhere[] = [];
const find: FindSeedCategory = (where) => {
  calls.push(where);
  return prisma.category.findFirst({ where, select: { id: true }, orderBy: { id: "asc" } });
};

async function cat(code: string, nameTr: string, level: number, opts: { inDiscovery?: boolean; keywords?: string } = {}) {
  const parentId = level === 1 ? null : level === 2 ? `${code.slice(0, 2)}000000` : level === 3 ? `${code.slice(0, 4)}0000` : `${code.slice(0, 6)}00`;
  await prisma.category.create({
    data: {
      id: code,
      code,
      nameTr,
      keywords: opts.keywords ?? "",
      searchText: foldSearchText(`${nameTr} ${opts.keywords ?? ""}`),
      level,
      parentId,
      isActive: true,
      inDiscovery: opts.inDiscovery ?? true,
    },
  });
}

/**
 * Katalog (test). Gizli satırlar kod sırasında ÖNDE ya da ad eşleşmesinde tek
 * aday olacak biçimde seçildi: süzgeç kalkarsa sorgu onları döndürür.
 */
async function seedCatalog() {
  // Gizli segment 10 (2026-09-19) — eski ürün/talep kategorileri burada duruyor.
  await cat("10000000", "Canlı Bitkiler, Hayvanlar ve Sarf Malzemeleri", 1);
  await cat("10100000", "Canlı hayvanlar", 2);
  await cat("10101500", "Çiftlik hayvanları", 3);
  await cat("10150000", "Yapısal peyzaj bitkileri", 2); // adında "Yapı" geçen gizli aile
  await cat("10160000", "Çiçekçilik ve orman ürünleri", 2);
  await cat("10161500", "Masa üstü çiçek aranjmanları", 3); // adında "masa" geçen gizli sınıf
  // GÖRÜNÜR segment 46 (2026-10-10) — gizli aileleri ve gizli sınıfıyla.
  // Gizli satırlar kod sırasında görünürlerden ÖNCE: 46101500 segmentin ilk
  // sınıfı, "koruma" adıyla ilk eşleşme gizli 46151500.
  await cat("46000000", "İş Güvenliği ve Yangın Ekipmanları", 1);
  await cat("46100000", "Hafif silahlar ve mühimmat", 2); // gizli aile
  await cat("46101500", "Ateşli silahlar", 3);
  await cat("46150000", "Kolluk ekipmanları", 2); // gizli aile
  await cat("46151500", "Kalabalık kontrol koruma gereçleri", 3);
  await cat("46180000", "Kişisel güvenlik ve korunma", 2); // görünür aile
  await cat("46181700", "Yüz ve baş koruma", 3);
  await cat("46182500", "Kişisel güvenlik cihazları veya silahları", 3); // görünür ailenin gizli sınıfı
  // Gizli segment 52: "bornoz" yalnız burada.
  await cat("52000000", "Ev Aletleri ve Tüketici Elektroniği", 1);
  await cat("52120000", "Yatak, masa ve mutfak örtüleri", 2);
  await cat("52121700", "Havlular ve bornozlar", 3);
  // Görünür segmentler.
  await cat("23000000", "Endüstriyel Üretim ve İşleme Makineleri", 1);
  await cat("23150000", "Endüstriyel proses makineleri", 2);
  await cat("23152200", "Üretim masaları ve standları", 3);
  await cat("30000000", "Yapı ve İnşaat Bileşenleri", 1);
  await cat("30100000", "Yapı bileşenleri", 2);
  await cat("30102300", "Profiller", 3);
  await cat("30160000", "İç mekân bitirme malzemeleri", 2);
  await cat("31000000", "Üretim Bileşenleri", 1);
  await cat("31160000", "Bağlantı elemanları", 2);
  await cat("31161500", "Vidalar", 3);
  await cat("31161600", "Cıvatalar", 3, { inDiscovery: false }); // discovery dışı
  // Segmenti olan ama L3'ü olmayan görünür dal.
  await cat("39000000", "Elektrik Sistemleri ve Aydınlatma", 1);
}

beforeEach(async () => {
  await truncateAll();
  calls.length = 0;
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("resolveVisibleDiscoveryCategory (seed-marketplace-demo, seed-staging-demo `resolveCat`)", () => {
  beforeEach(seedCatalog);

  it("geçerli (discovery, L3+) görünür kod aynen döner", async () => {
    await expect(resolveVisibleDiscoveryCategory(find, "t", "31161500")).resolves.toBe("31161500");
    await expect(resolveVisibleDiscoveryCategory(find, "t", "30102300", "profil")).resolves.toBe("30102300");
  });

  it("anahtar kelime yedeği gizli segmentteki eşleşmeyi ATLAR: 'masa' → 10161500 değil 23152200", async () => {
    // Kod katalogda yok, segment 31'de "masa" yok → tüm katalogda aranır.
    // Kod sırasında ilk "masa" gizli 10161500; ikincisi gizli 52'de aile (L2, sayılmaz).
    await expect(resolveVisibleDiscoveryCategory(find, "t", "31999900", "masa")).resolves.toBe("23152200");
  });

  it("anahtar kelime yalnız gizli segmentte varsa kodun KENDİ segmentindeki ilk sınıfa düşer", async () => {
    await expect(resolveVisibleDiscoveryCategory(find, "t", "31999900", "bornoz")).resolves.toBe("31161500");
    // Discovery dışı sınıf (31161600) hiçbir aşamada seçilmez.
    await expect(resolveVisibleDiscoveryCategory(find, "t", "31161600")).resolves.toBe("31161500");
  });

  it("çözülemeyen kod gizli bir kategoriye DÜŞMEZ, betik durur", async () => {
    // Segment 39'da sınıf yok; "hayvan" yalnız gizli 10'da.
    await expect(resolveVisibleDiscoveryCategory(find, "t", "39121000", "hayvan")).rejects.toThrow(
      "[t] category could not be resolved: 39121000 (hayvan)",
    );
  });

  it("her sorgu gizli kategori süzgecini taşır (segment + aile + sınıf önekleri)", async () => {
    await resolveVisibleDiscoveryCategory(find, "t", "31999900", "masa");
    expect(calls.length).toBe(3); // kod → segmentte ad → katalogda ad
    for (const where of calls) {
      expect(where.NOT).toEqual(
        expect.arrayContaining([
          { id: { startsWith: "10" } },
          { id: { startsWith: "77" } },
          { id: { startsWith: "4610" } },
          { id: { startsWith: "4615" } },
          { id: { startsWith: "461825" } },
        ]),
      );
      // 46'nın kendisi artık süzülmez (2026-10-10).
      expect(where.NOT).not.toContainEqual({ id: { startsWith: "46" } });
    }
  });

  it("eski kaydın gizli kodu verilirse sorgu ATILMADAN durur (gizli aile, gizli sınıf, gizli segment)", async () => {
    await expect(resolveVisibleDiscoveryCategory(find, "seed-x", "46101500", "tabanca")).rejects.toThrow(/46101500/);
    await expect(resolveVisibleDiscoveryCategory(find, "seed-x", "46182500")).rejects.toThrow(/hidden category prefix/);
    await expect(resolveVisibleDiscoveryCategory(find, "seed-x", "10101500")).rejects.toThrow(/hidden category prefix/);
    expect(calls).toEqual([]);
  });

  /**
   * GÖRÜNÜR SEGMENTİN GİZLİ DALLARI (2026-10-10). 46 görünür olduğu için
   * yedekler artık 46'nın İÇİNDE gezer; süzgeç yalnız segment düzeyinde
   * kalsaydı ilk sınıf 46101500 (ateşli silahlar) seçilirdi.
   */
  it("46 altındaki görünür sınıf aynen döner (baret)", async () => {
    await expect(resolveVisibleDiscoveryCategory(find, "t", "46181700", "baret")).resolves.toBe("46181700");
  });

  it("segment içi ad yedeği gizli aileyi ATLAR: 'koruma' → 46151500 değil 46181700", async () => {
    await expect(resolveVisibleDiscoveryCategory(find, "t", "46999900", "koruma")).resolves.toBe("46181700");
  });

  it("'segmentin ilk sınıfı' yedeği gizli aileye düşmez: 46101500 değil 46181700", async () => {
    await expect(resolveVisibleDiscoveryCategory(find, "t", "46999900")).resolves.toBe("46181700");
    // Anahtar kelime yalnız gizli dallarda geçiyorsa da aynı görünür sınıf.
    await expect(resolveVisibleDiscoveryCategory(find, "t", "46999900", "silah")).resolves.toBe("46181700");
  });
});

describe("firma beyanı çözümü (segmentCode / existingPick)", () => {
  beforeEach(seedCatalog);

  it("visibleSegmentOf: görünür kodun segmenti; katalogda yoksa null; gizli kod durdurur", async () => {
    await expect(visibleSegmentOf(find, "t", "31161500")).resolves.toBe("31000000");
    await expect(visibleSegmentOf(find, "t", "30000000")).resolves.toBe("30000000");
    await expect(visibleSegmentOf(find, "t", "41000000")).resolves.toBeNull(); // test kataloğunda yok
    // 46 geri açıldı: segmentin kendisi ve görünür sınıfı segmente çözülür.
    await expect(visibleSegmentOf(find, "t", "46000000")).resolves.toBe("46000000");
    await expect(visibleSegmentOf(find, "t", "46181700")).resolves.toBe("46000000");
    // Gizli ailedeki kod görünür segmentine SESSİZCE yuvarlanmaz — durur.
    await expect(visibleSegmentOf(find, "t", "46101500")).rejects.toThrow(/46101500/);
    await expect(visibleSegmentOf(find, "t", "10101500")).rejects.toThrow(/hidden category prefix/);
  });

  it("existingVisiblePick: var olan seçim aynen, olmayan segmentine; gizli seçim durdurur", async () => {
    await expect(existingVisiblePick(find, "t", "31161500")).resolves.toBe("31161500");
    await expect(existingVisiblePick(find, "t", "31999900")).resolves.toBe("31000000");
    await expect(existingVisiblePick(find, "t", "41121500")).resolves.toBeNull();
    await expect(existingVisiblePick(find, "t", "52121700")).rejects.toThrow(/52121700/);
    await expect(existingVisiblePick(find, "t", "46180000")).resolves.toBe("46180000");
    await expect(existingVisiblePick(find, "t", "46199900")).resolves.toBe("46000000"); // katalogda yok → segmenti
    await expect(existingVisiblePick(find, "t", "46100000")).rejects.toThrow(/46100000/);
    await expect(existingVisiblePick(find, "t", "46182500")).rejects.toThrow(/46182500/);
  });
});

describe("visibleActiveFamilyWhere (seed-demo-fill havuzu, add-anadolu-listing)", () => {
  beforeEach(seedCatalog);

  it("aile havuzu kod sırasıyla ve yalnız görünür ailelerden", async () => {
    const pool = await prisma.category.findMany({
      where: visibleActiveFamilyWhere(),
      select: { code: true },
      orderBy: { code: "asc" },
      take: 24,
    });
    // Süzgeçsiz hâliyle havuz 10100000, 10150000, 10160000 ile başlardı. 46'dan
    // yalnız görünür aile girer: gizli 46100000 ve 46150000 havuzda YOK.
    expect(pool.map((c) => c.code)).toEqual(["23150000", "30100000", "30160000", "31160000", "46180000"]);
  });

  it("ada göre seçim ('İnşaat' / 'Yapı') gizli aileyi döndürmez", async () => {
    const hit = await prisma.category.findFirst({
      where: {
        ...visibleActiveFamilyWhere(),
        OR: [
          { nameTr: { contains: "İnşaat", mode: "insensitive" } },
          { nameTr: { contains: "Yapı", mode: "insensitive" } },
        ],
      },
      select: { code: true },
      orderBy: { code: "asc" },
    });
    expect(hit?.code).toBe("30100000"); // kod sırasında önce gelen gizli 10150000 değil
  });

  it("pasif aile havuza girmez", async () => {
    await prisma.category.update({ where: { id: "23150000" }, data: { isActive: false } });
    const pool = await prisma.category.findMany({ where: visibleActiveFamilyWhere(), select: { code: true }, orderBy: { code: "asc" } });
    expect(pool.map((c) => c.code)).toEqual(["30100000", "30160000", "31160000", "46180000"]);
  });
});

/**
 * GÖRÜNÜR KATEGORİNİN ALT AĞACI — paylaşılan `where` parçaları gerçek Postgres'te
 * (2026-10-10). API ve web'in "46 altındaki ürünler / kategoriler" sorguları bu
 * parçalardan kurulur; birim testi biçimi, burası SONUCU kilitler: 4610xxxx'te
 * saklanmış kayıt "İş Güvenliği ve Yangın Ekipmanları" altında gelmez.
 */
describe("categorySubtreeWhere / hiddenCategoryWhere — gerçek sorgu", () => {
  beforeEach(seedCatalog);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it("Category.id: 46'nın alt ağacı gizli aileler ve gizli sınıf OLMADAN", async () => {
    const under46 = await prisma.category.findMany({ where: categorySubtreeWhere("46000000", "id")!, select: { id: true }, orderBy: { id: "asc" } });
    expect(ids(under46)).toEqual(["46000000", "46180000", "46181700"]);
    const under4618 = await prisma.category.findMany({ where: categorySubtreeWhere("46180000", "id")!, select: { id: true }, orderBy: { id: "asc" } });
    expect(ids(under4618)).toEqual(["46180000", "46181700"]); // 46182500 gizli sınıf
    // Karşılaştırma: düz önek süzgeci (eski biçim) gizli dalları da getirirdi.
    const raw = await prisma.category.findMany({ where: { id: { startsWith: "46" } }, select: { id: true } });
    expect(raw).toHaveLength(8);
  });

  it("katalog süzgeciyle birlikte (AND) aynı sonuç; gizli torunu olmayan kodda düz önek", async () => {
    const both = await prisma.category.findMany({
      where: { AND: [hiddenCategoryWhere(), categorySubtreeWhere("46", "id")!, { level: 3 }] },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    expect(ids(both)).toEqual(["46181700"]);
    const under31 = await prisma.category.findMany({ where: categorySubtreeWhere("31000000", "id")!, select: { id: true }, orderBy: { id: "asc" } });
    expect(ids(under31)).toEqual(["31000000", "31160000", "31161500", "31161600"]);
    // Katalogdaki 46 satırlarından görünür olanlar = hiddenCategoryWhere'in bıraktıkları.
    const visible46 = await prisma.category.findMany({
      where: { id: { startsWith: "46" }, ...hiddenCategoryWhere() },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    expect(ids(visible46)).toEqual(["46000000", "46180000", "46181700"]);
  });

  it("kendisi gizli kodda HAM alt ağaç (çağıran önce visibleCategoryId ile karar verir)", async () => {
    const rows = await prisma.category.findMany({ where: categorySubtreeWhere("46100000", "id")!, select: { id: true }, orderBy: { id: "asc" } });
    expect(ids(rows)).toEqual(["46100000", "46101500"]);
  });

  it("CompanyItem.categoryId: gizli dalda saklanmış ürün görünür atanın altında listelenmez / sayılmaz", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    const stored: (string | null)[] = ["46181700", "46181701", "46101500", "46151500", "46182501", "46000000", "31161500", null];
    await prisma.companyItem.createMany({
      data: stored.map((categoryId, i) => ({
        companyId: company.id,
        createdById: user.id,
        name: `Urun ${i}`,
        unit: "adet",
        slug: `urun-${i}`,
        categoryId,
        searchText: `urun ${i}`,
      })),
    });
    const where = categorySubtreeWhere("46000000", "categoryId")!;
    const rows = await prisma.companyItem.findMany({ where: { AND: [{ companyId: company.id }, where] }, select: { categoryId: true }, orderBy: { categoryId: "asc" } });
    expect(rows.map((r) => r.categoryId)).toEqual(["46000000", "46181700", "46181701"]);
    expect(await prisma.companyItem.count({ where: { AND: [{ companyId: company.id }, where] } })).toBe(3);
    // Bellekteki ikiz aynı kümeyi seçer (facet sayaçları satırları bellekte süzer).
    expect(stored.filter(categorySubtreeMatcher("46000000")!).sort()).toEqual(["46000000", "46181700", "46181701"]);
    // Ham SQL: gizli önekler `hiddenPrefixesUnder`den (talep `categoryIds` dizisi böyle süzülür).
    const patterns = hiddenPrefixesUnder("46000000").map((p) => `${p}%`);
    const raw = await prisma.$queryRaw<{ categoryId: string }[]>`
      SELECT "categoryId" FROM company_items
      WHERE "companyId" = ${company.id} AND "categoryId" LIKE ${"46%"} AND NOT ("categoryId" LIKE ANY(${patterns}))
      ORDER BY "categoryId"`;
    expect(raw.map((r) => r.categoryId)).toEqual(["46000000", "46181700", "46181701"]);
  });

  it("NULL olabilen alanda hiddenCategoryWhere(alan) kategorisiz satırı da ELER; OR ile kalır", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    await prisma.companyItem.createMany({
      data: (["31161500", "46181700", "46101500", "10101500", null] as (string | null)[]).map((categoryId, i) => ({
        companyId: company.id,
        createdById: user.id,
        name: `Urun ${i}`,
        unit: "adet",
        slug: `urun-${i}`,
        categoryId,
        searchText: `urun ${i}`,
      })),
    });
    const only = await prisma.companyItem.findMany({
      where: { AND: [{ companyId: company.id }, hiddenCategoryWhere("categoryId")] },
      select: { categoryId: true },
      orderBy: { categoryId: "asc" },
    });
    expect(only.map((r) => r.categoryId)).toEqual(["31161500", "46181700"]);
    const withUncategorised = await prisma.companyItem.findMany({
      where: { AND: [{ companyId: company.id }, { OR: [{ categoryId: null }, hiddenCategoryWhere("categoryId")] }] },
      select: { categoryId: true },
    });
    expect(withUncategorised.map((r) => r.categoryId).sort((a, b) => String(a).localeCompare(String(b)))).toEqual([
      "31161500",
      "46181700",
      null,
    ]);
  });
});

describe("apply-category-keywords -- --dry", () => {
  const DB_DIR = path.resolve(__dirname, "../../../../packages/db");
  const LEGACY = "46101900"; // gizli ailedeki (4610) eski kayıt kodu; katalog satırı BİREBİR durur, betikler ona da uygulanır

  it("kuru çalışma değişecek satırı sayar ve tabloya DOKUNMAZ", async () => {
    const { byCode } = buildKeywordsByCode(path.join(DB_DIR, "src/seeds"));
    expect(byCode.get(LEGACY)).toBeTruthy(); // fikstür sağlaması: bu kodun sözlükte eşanlamlısı var
    // Üst düğümler ZATEN güncel (sözlükteki değerle); yalnız yaprağın eşanlamlısı eksik.
    await cat("46000000", "İş Güvenliği ve Yangın Ekipmanları", 1, { keywords: byCode.get("46000000") ?? "" });
    await cat("46100000", "Hafif silahlar ve mühimmat", 2, { keywords: byCode.get("46100000") ?? "" });
    await cat(LEGACY, "Kesici silahlar ve aksesuarları", 3);
    const before = await prisma.category.findUniqueOrThrow({ where: { id: LEGACY }, select: { keywords: true, searchText: true } });
    expect(before.keywords).toBe("");

    const out = execFileSync(path.join(DB_DIR, "node_modules/.bin/tsx"), ["prisma/scripts/apply-category-keywords.ts", "--dry"], {
      cwd: DB_DIR,
      encoding: "utf8",
      // ENV_FILE boş: betik kök `.env`i okur ama kabukta DB adresi varken DB anahtarlarını ALMAZ.
      env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL, ENV_FILE: "" },
    });

    const target = new URL(TEST_DB_URL);
    expect(out.split("\n")[0]).toContain(`[apply-category-keywords] hedef veritabanı: ${target.hostname}:${target.port}`);
    expect(out).toContain("1 satır değişiyor");
    expect(out).toContain(`${LEGACY}  -> `);
    expect(out).toContain("(--dry) 1 row(s) would change; nothing written to the database.");

    const after = await prisma.category.findUniqueOrThrow({ where: { id: LEGACY }, select: { keywords: true, searchText: true } });
    expect(after).toEqual(before);
  }, 120_000);
});

/**
 * EŞ ANLAMLI ÜRETİCİSİ GİZLİ DALI MODELE YOLLAMAZ (2026-10-10 gözden geçirmesi). Betik
 * aktif L2-L4 düğümlerini tablodan seçer ve her birini adı + üst yoluyla isteme
 * koyar. Süzgeçsiz hâliyle `--segments 46` yeniden açılan sektörün silah / kolluk
 * ailelerini ve 461825 sınıfını da isteme koyuyordu.
 *
 * `--limit 0`: betik adayları sayar ve basar, hiçbir grubu modele GÖNDERMEZ —
 * gerçek betiğin gerçek seçimi model çağrısı olmadan sınanır.
 */
describe("gen-category-keywords -- --segments 46 --limit 0", () => {
  const DB_DIR = path.resolve(__dirname, "../../../../packages/db");
  const SEEDS = path.join(DB_DIR, "src/seeds");
  const GENERATED = path.join(SEEDS, "category-keywords.generated.tsv");
  /** Betikle AYNI okuma: sözlüğü zaten olan kodlar (iki sözlük dosyasının ilk sütunu) aday olmaz. */
  const alreadyDone = () =>
    new Set(
      ["category-keywords.tsv", "category-keywords.generated.tsv"].flatMap((file) =>
        fs.readFileSync(path.join(SEEDS, file), "utf8").split("\n").map((line) => line.split("\t")[0]!.trim()),
      ),
    );

  it("yeniden açılan sektörde yalnız GÖRÜNÜR düğümler aday olur; gizli aile ve gizli sınıf isteme girmez", async () => {
    // Sınıf / yaprak kodları gerçek katalogda YOK (…99): sonuç sözlük dosyalarının içeriğine bağlı kalmaz.
    await cat("46000000", "İş Güvenliği ve Yangın Ekipmanları", 1); // L1 aday değildir
    await cat("46100000", "Hafif silahlar ve mühimmat", 2); // gizli aile
    await cat("46109900", "Deneme silah sınıfı", 3);
    await cat("46109901", "Deneme silah yaprağı", 4);
    await cat("46180000", "Kişisel güvenlik ve korunma", 2); // görünür aile
    await cat("46189900", "Deneme koruyucu sınıfı", 3);
    await cat("46189901", "Deneme koruyucu yaprağı", 4);
    await cat("46182500", "Kişisel güvenlik cihazları veya silahları", 3); // görünür ailenin gizli sınıfı
    await cat("46182599", "Deneme sprey yaprağı", 4);
    await cat("31000000", "Üretim Bileşenleri", 1); // `--segments 46` dışında
    await cat("31160000", "Bağlantı elemanları", 2);
    const done = alreadyDone();
    const visible = ["46180000", "46189900", "46189901"].filter((code) => !done.has(code));
    const hidden = ["46100000", "46109900", "46109901", "46182500", "46182599"].filter((code) => !done.has(code));
    // Fikstür sağlaması: süzgeç kalkarsa sayı değişir (gizli deneme kodları sözlükte olamaz).
    expect(visible.length).toBeGreaterThanOrEqual(2);
    expect(hidden.length).toBeGreaterThanOrEqual(3);
    const before = fs.statSync(GENERATED);

    const out = execFileSync(
      path.join(DB_DIR, "node_modules/.bin/tsx"),
      ["prisma/scripts/gen-category-keywords.ts", "--segments", "46", "--limit", "0"],
      {
        cwd: DB_DIR,
        encoding: "utf8",
        // Model anahtarı kullanılmaz (`--limit 0`); kök `.env`deki gerçek anahtar da okunmasın.
        env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL, ENV_FILE: "", GEMINI_API_KEY: "unused" },
      },
    );

    const target = new URL(TEST_DB_URL);
    expect(out.split("\n")[0]).toContain(`[gen-category-keywords] hedef veritabanı: ${target.hostname}:${target.port}`);
    expect(out).toContain(`Üretilecek: ${visible.length} düğüm (`);
    // Hiçbir grup modele gitmedi; sözlük dosyasına satır eklenmedi.
    expect(out).toContain("Bitti: 0 satır");
    const after = fs.statSync(GENERATED);
    expect([after.size, after.mtimeMs]).toEqual([before.size, before.mtimeMs]);
  }, 120_000);
});

/**
 * 46'NIN YENİ ADI TABLOYA OPERATÖR BETİKLERİYLE GİDER (2026-10-10 gözden geçirmesi).
 *
 * API kategori adını `categories` tablosundan okur (`category-name.ts`); tohum
 * dosyalarını tabloya `apply-category-translations` (TR + arama metni) ve
 * `apply-category-names-i18n` (EN / RU) yazar, dağıtımdan SONRA. 46'yı görünür
 * yapan kod, satır hâlâ eski adı taşırken yayına girerse sektör sahibin
 * anasayfadan kaldırttığı adla ("Kolluk, …") ve o adın adresiyle görünürdü —
 * bu yüzden üç satır ayrıca veri migration'ıyla yazılır
 * (`20261010120000_category_rename_safety_logistics`,
 * `category-rename-migration.spec`); burası betiklerin AYNI sonuca vardığını
 * kilitler (migration'sız bir veritabanında da ad doğru yazılır).
 *
 * Betikler çocuk süreçte, YALNIZ bu testin veritabanına karşı koşar (ilk koşu
 * kuru; hedef satırı denetlenir).
 */
describe("46 yeniden adlandırma: operatör betikleri eski adlı satırı yeni ada çevirir", () => {
  const DB_DIR = path.resolve(__dirname, "../../../../packages/db");
  const SEGMENT = "46000000";
  /** Staging / canlı satırının dağıtımdan önceki hâli (2026-10-10 öncesi tohumlar). */
  const OLD = {
    nameTr: "Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları",
    nameEn: "Law Enforcement and National Security and Security and Safety Equipment and Supplies",
    nameRu: "Оборудование для правоохранительных органов, национальной безопасности и охраны",
  };
  const NEW = {
    nameTr: "İş Güvenliği ve Yangın Ekipmanları",
    nameEn: "Workplace Safety and Fire Equipment",
    nameRu: "Средства охраны труда и противопожарное оборудование",
  };
  const run = (script: string, ...args: string[]) =>
    execFileSync(path.join(DB_DIR, "node_modules/.bin/tsx"), [`prisma/scripts/${script}.ts`, ...args], {
      cwd: DB_DIR,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL, ENV_FILE: "" },
    });
  const names = async () =>
    prisma.category.findUniqueOrThrow({ where: { id: SEGMENT }, select: { nameTr: true, nameEn: true, nameRu: true } });
  /** API'nin sektör listesindeki satır (ad okuyucunun dilinde, adres Türkçe addan). */
  const shown = (locale: string) =>
    runWithLocale(locale, async () => {
      const segment = (await new CategoryService(prisma as never).getSegments()).find((s) => s.id === SEGMENT);
      return segment ? { name: segment.nameTr, slug: segment.slug } : null;
    });

  it("uygulanmamış tabloda sektör ESKİ adıyla görünür; betiklerden sonra üç dilde yeni ad, yeni adres, yeni arama metni; ikinci koşu boş", async () => {
    await prisma.category.create({
      data: {
        id: SEGMENT,
        code: SEGMENT,
        level: 1,
        parentId: null,
        isActive: true,
        inDiscovery: true,
        ...OLD,
        keywords: OLD.nameEn,
        searchText: categorySearchText({ ...OLD, keywords: OLD.nameEn }),
      },
    });
    // Betikler koşulmadan: görünürlüğü açan kod sektörü ESKİ adıyla gösterir — sıra bu yüzden önemli.
    expect(await shown("tr")).toEqual({ name: OLD.nameTr, slug: "kolluk-ulusal-guvenlik-ve-emniyet-ekipmanlari" });

    // 1) Kuru koşu: hedef bu testin veritabanı, değişecek satır basılır, tablo aynen kalır.
    const target = new URL(TEST_DB_URL);
    const dry = run("apply-category-translations", "--dry");
    expect(dry.split("\n")[0]).toContain(`[apply-category-translations] hedef veritabanı: ${target.hostname}:${target.port}`);
    expect(dry).toContain(`${SEGMENT}  → ${NEW.nameTr}`);
    expect(dry).toContain("(--dry) DB'ye yazılmadı.");
    expect(await names()).toEqual(OLD);

    // 2) Yalnız TR betiği: EN / RU hâlâ eski ad — iki betik birlikte koşulur.
    run("apply-category-translations");
    expect(await names()).toEqual({ ...OLD, nameTr: NEW.nameTr });
    run("apply-category-names-i18n");
    expect(await names()).toEqual(NEW);

    // Arama metni yeni adı üç dilde taşır; eski Türkçe ad aramada da kalmaz.
    const { searchText } = await prisma.category.findUniqueOrThrow({ where: { id: SEGMENT }, select: { searchText: true } });
    for (const term of [NEW.nameTr, NEW.nameEn, NEW.nameRu]) expect(searchText).toContain(foldSearchText(term));
    expect(searchText).not.toContain("kolluk");

    // API: üç dilde yeni ad; adres her dilde aynı (Türkçe addan).
    expect(await shown("tr")).toEqual({ name: NEW.nameTr, slug: "is-guvenligi-ve-yangin-ekipmanlari" });
    expect(await shown("en")).toEqual({ name: NEW.nameEn, slug: "is-guvenligi-ve-yangin-ekipmanlari" });
    expect(await shown("ru")).toEqual({ name: NEW.nameRu, slug: "is-guvenligi-ve-yangin-ekipmanlari" });

    // 3) İkinci kuru koşu: yazılacak satır yok (dağıtımdan sonra yeniden koşmak güvenli).
    expect(run("apply-category-translations", "--dry")).toContain("0 satır değişiyor, 1 zaten güncel");
    expect(run("apply-category-names-i18n", "--dry")).toContain("(kuru çalışma) güncellenen 0 ·");
  }, 180_000);
});

/**
 * 46'NIN EŞ ANLAMLILARI — GÜNDELİK SÖZCÜK DOĞRU DALI BULUR (2026-10-10).
 *
 * Sektör, eş anlamlılar üretilirken gizliydi; aileleri ve sınıfları yalnız
 * resmî adlarıyla bulunuyordu ("kkd", "isg", "iş ayakkabısı", "yangın tüpü" →
 * sonuç yok). Sektör satırı aramada yalnız ADIYLA eşleştiği için 46000000
 * satırındaki sözcükler dalları buldurmaz; görünür her aile ve sınıf kendi elle
 * yazılmış satırını taşır (`category-keywords.tsv`).
 *
 * Burası SONUCU kilitler: sektörün tamamı (görünür + gizli dallar) tohum
 * dosyalarından `seed-categories` ile aynı bileşimle kurulur ve seçicilerin
 * çağırdığı arama (`searchHierarchical`, discovery kataloğu) koşulur. Satırlar
 * silinirse ilk test; bir satıra silah / kolluk sözcüğü yazılırsa ikinci ya da
 * üçüncü test kırılır. Dosya kilidi (kod listesi, yasak sözcükler):
 * `seed-category-guard.spec`.
 */
describe("46 eş anlamlıları: tohum dosyaları + gerçek arama (searchHierarchical)", () => {
  const SEEDS = path.resolve(__dirname, "../../../../packages/db/src/seeds");
  /** 4618 ailesinin görünür on sınıfı (461825 gizli). */
  const FAMILY_4618_CLASSES = [
    ...["46181500", "46181600", "46181700", "46181800", "46181900"],
    ...["46182000", "46182100", "46182200", "46182300", "46182400"],
  ];
  /** KKD sınıfları: giysi, ayak, baş / yüz, göz, kulak, solunum, düşmeye karşı koruma. */
  const PPE_CLASSES = ["46181500", "46181600", "46181700", "46181800", "46181900", "46182000", "46182300"];

  /**
   * Sektör 46'nın bütün satırları, `seed-categories` ile AYNI bileşimle: ad çeviri katmanından, EN / RU
   * ad dosyasından; eş anlamlılar ve arama metni tek kaynak işlevlerden. Dönen değer satır sayısıdır.
   */
  async function seedSector46(): Promise<number> {
    const translations = readTranslations(SEEDS);
    const names = readI18nNames(SEEDS);
    const { byCode } = buildKeywordsByCode(SEEDS);
    const source = fs
      .readFileSync(path.join(SEEDS, "ariba-categories.tsv"), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("46"))
      .map((line) => line.split("\t"));
    for (const level of [1, 2, 3, 4]) {
      await prisma.category.createMany({
        data: source
          .filter((cols) => Number(cols[1]) === level)
          .map((cols, index) => {
            const code = cols[0]!;
            const nameTr = translations.get(code)?.tr ?? cols[4]!.trim();
            const nameEn = names.get(code)?.en ?? null;
            const nameRu = names.get(code)?.ru ?? null;
            const keywords = byCode.get(code) ?? "";
            return {
              id: code,
              code,
              nameTr,
              nameEn,
              nameRu,
              keywords,
              searchText: categorySearchText({ nameTr, keywords, nameEn, nameRu }),
              level,
              parentId: cols[2] || null,
              segmentLetter: cols[3] || null,
              sortOrder: index,
              isActive: true,
              inDiscovery: (cols[5] ?? "1").trim() !== "0",
            };
          }),
      });
    }
    return source.length;
  }

  type Tree = Awaited<ReturnType<CategoryService["searchHierarchical"]>>;
  /** Kategori seçicilerinin çağırdığı arama (Türkçe arayüz): talep seçicisi discovery, firma beyanı tam katalog. */
  const search = (query: string, catalog: "discovery" | "full" = "discovery"): Promise<Tree> =>
    runWithLocale("tr", () => new CategoryService(prisma as never).searchHierarchical(query, catalog));
  /** Sonuç ağacında 46 altındaki düğümler. */
  const under46 = (tree: Tree) => {
    const families = tree.segments.filter((segment) => segment.code.startsWith("46")).flatMap((segment) => segment.families);
    const classes = families.flatMap((family) => family.classes);
    return {
      matchedFamilies: families.filter((family) => family.isMatch).map((family) => family.code).sort(),
      matchedClasses: classes.filter((cls) => cls.isMatch).map((cls) => cls.code).sort(),
      listedClasses: classes.map((cls) => cls.code).sort(),
      leaves: classes.flatMap((cls) => cls.commodities.map((leaf) => leaf.code)).sort(),
    };
  };

  it("gündelik sözcük ve kısaltma doğru aileyi / sınıfı bulur", async () => {
    expect(await seedSector46()).toBeGreaterThan(400);
    const expected: Array<[query: string, families: string[], classes: string[]]> = [
      ["kkd", ["46180000"], PPE_CLASSES],
      ["ppe", ["46180000"], PPE_CLASSES],
      ["сиз", ["46180000"], PPE_CLASSES],
      ["kişisel koruyucu donanım", ["46180000"], []],
      ["isg", ["46180000", "46210000"], ["46211500", "46211600", "46211700"]],
      ["iş sağlığı ve güvenliği", ["46180000", "46210000"], ["46211500"]],
      ["iş ayakkabısı", [], ["46181600"]],
      ["çelik burunlu", [], ["46181600"]],
      ["iş eldiveni", [], ["46181500"]],
      ["reflektörlü yelek", [], ["46181500"]],
      ["toz maskesi", [], ["46182000"]],
      ["emniyet kemeri", [], ["46182300"]],
      ["yangın tüpü", [], ["46191600"]],
      ["yangın dolabı", [], ["46191600"]],
    ];
    for (const [query, families, classes] of expected) {
      const found = under46(await search(query));
      expect({ query, families: found.matchedFamilies, classes: found.matchedClasses }).toEqual({ query, families, classes });
    }
    // Eşleşen aile görünür sınıflarının TAMAMIYLA açılır; gizli 46182500 o listede yok.
    expect(under46(await search("kkd")).listedClasses).toEqual(FAMILY_4618_CLASSES);
  }, 120_000);

  it("silah / tabanca / mühimmat / weapon / law enforcement 46 altında HİÇBİR dal döndürmez", async () => {
    await seedSector46();
    // Fikstür sağlaması: gizli dallar tabloda ve bu sözcükleri taşıyor; sonuçsuzluk boş katalogdan değil.
    for (const folded of ["silah", "tabanca", "muhimmat", "weapon", "law enforcement"]) {
      const rows = await prisma.category.count({ where: { searchText: { contains: folded } } });
      expect({ folded, present: rows > 0 }).toEqual({ folded, present: true });
    }
    for (const catalog of ["discovery", "full"] as const) {
      for (const query of ["silah", "tabanca", "mühimmat", "weapon", "law enforcement"]) {
        const tree = await search(query, catalog);
        expect({ catalog, query, segments: tree.segments.map((segment) => segment.code) }).toEqual({ catalog, query, segments: [] });
      }
    }
  }, 120_000);

  it("kolluk: 46 altında yalnız ADI 'Güvenlik kollukları' olan yaprak (46181516); ailesi ve sınıfı eşleşme değil, yol", async () => {
    await seedSector46();
    // Gizli aile 46150000 tabloda duruyor ve adı bu sözcüğü taşıyor.
    const hiddenFamily = await prisma.category.findUniqueOrThrow({ where: { id: "46150000" }, select: { nameTr: true } });
    expect(hiddenFamily.nameTr).toBe("Kolluk ekipmanları");
    const tree = await search("kolluk");
    expect(tree.segments.map((segment) => segment.code)).toEqual(["46000000"]);
    expect(tree.segments[0]!.families.map((family) => family.code)).toEqual(["46180000"]);
    expect(under46(tree)).toEqual({ matchedFamilies: [], matchedClasses: [], listedClasses: ["46181500"], leaves: ["46181516"] });
  }, 120_000);
});
