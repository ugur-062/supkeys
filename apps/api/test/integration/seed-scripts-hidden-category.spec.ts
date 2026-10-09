/**
 * SEED BETİKLERİNİN KATALOG SORGULARI GİZLİ SEGMENTE DÜŞMEZ (2026-10-09) —
 * gerçek Postgres + gerçek Prisma `where`.
 *
 * Demo betikleri kategori kodunu katalogdan ÇÖZER: kod yoksa anahtar kelimeyle
 * en yakın sınıfa, o da yoksa segmentin ilk sınıfına düşer. Süzgeçsiz hâliyle
 * yedek gizli segmente inebiliyordu ("masa" → 42192000, "gümrük" → 93171700),
 * `seed-demo-fill` kod sırasız ilk 24 aileyi alıyor (hepsi segment 10) ve
 * `add-anadolu-listing` ad eşleşmesiyle gizli bir aileyi seçebiliyordu. Gizli
 * segmentteki kayıtlar DURUR (eski ürün/talep); seed onlara yenisini eklemez.
 *
 * İkinci kısım `apply-category-keywords -- --dry`: bayrak yokken betik `--dry`yi
 * yok sayıp hemen yazıyordu. Betik çocuk süreçte, YALNIZ bu testin veritabanına
 * karşı koşar (hedef satırı denetlenir).
 */
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { foldSearchText } from "@rothern/shared";
import { buildKeywordsByCode } from "../../../../packages/db/prisma/scripts/lib/category-keywords";
import {
  existingVisiblePick,
  resolveVisibleDiscoveryCategory,
  visibleActiveFamilyWhere,
  visibleSegmentOf,
  type FindSeedCategory,
  type SeedCategoryWhere,
} from "../../../../packages/db/prisma/scripts/lib/seed-category-guard";
import { TEST_DB_URL } from "./env";
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
  // Gizli segment 46 (2026-10-09).
  await cat("46000000", "Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları", 1);
  await cat("46180000", "Kişisel güvenlik ve koruma", 2);
  await cat("46181700", "Yüz ve baş koruma", 3);
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

  it("her sorgu gizli segment süzgecini taşır", async () => {
    await resolveVisibleDiscoveryCategory(find, "t", "31999900", "masa");
    expect(calls.length).toBe(3); // kod → segmentte ad → katalogda ad
    for (const where of calls) {
      expect(where.NOT).toEqual(expect.arrayContaining([{ id: { startsWith: "10" } }, { id: { startsWith: "46" } }, { id: { startsWith: "77" } }]));
    }
  });

  it("eski kaydın gizli kodu verilirse sorgu ATILMADAN durur (46 ve 10)", async () => {
    await expect(resolveVisibleDiscoveryCategory(find, "seed-x", "46181700", "baret")).rejects.toThrow(/46181700/);
    await expect(resolveVisibleDiscoveryCategory(find, "seed-x", "10101500")).rejects.toThrow(/hidden segment/);
    expect(calls).toEqual([]);
  });
});

describe("firma beyanı çözümü (segmentCode / existingPick)", () => {
  beforeEach(seedCatalog);

  it("visibleSegmentOf: görünür kodun segmenti; katalogda yoksa null; gizli kod durdurur", async () => {
    await expect(visibleSegmentOf(find, "t", "31161500")).resolves.toBe("31000000");
    await expect(visibleSegmentOf(find, "t", "30000000")).resolves.toBe("30000000");
    await expect(visibleSegmentOf(find, "t", "41000000")).resolves.toBeNull(); // test kataloğunda yok
    await expect(visibleSegmentOf(find, "t", "46000000")).rejects.toThrow(/46000000/);
    await expect(visibleSegmentOf(find, "t", "10101500")).rejects.toThrow(/hidden segment/);
  });

  it("existingVisiblePick: var olan seçim aynen, olmayan segmentine; gizli seçim durdurur", async () => {
    await expect(existingVisiblePick(find, "t", "31161500")).resolves.toBe("31161500");
    await expect(existingVisiblePick(find, "t", "31999900")).resolves.toBe("31000000");
    await expect(existingVisiblePick(find, "t", "41121500")).resolves.toBeNull();
    await expect(existingVisiblePick(find, "t", "52121700")).rejects.toThrow(/52121700/);
  });
});

describe("visibleActiveFamilyWhere (seed-demo-fill havuzu, add-anadolu-listing)", () => {
  beforeEach(seedCatalog);

  it("aile havuzu kod sırasıyla ve yalnız görünür segmentlerden", async () => {
    const pool = await prisma.category.findMany({
      where: visibleActiveFamilyWhere(),
      select: { code: true },
      orderBy: { code: "asc" },
      take: 24,
    });
    // Süzgeçsiz hâliyle havuz 10100000, 10150000, 10160000 ile başlardı.
    expect(pool.map((c) => c.code)).toEqual(["23150000", "30100000", "30160000", "31160000"]);
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
    expect(pool.map((c) => c.code)).toEqual(["30100000", "30160000", "31160000"]);
  });
});

describe("apply-category-keywords -- --dry", () => {
  const DB_DIR = path.resolve(__dirname, "../../../../packages/db");
  const LEGACY = "46181700"; // eski kayıt kodu; katalog satırı BİREBİR durur, betikler ona da uygulanır

  it("kuru çalışma değişecek satırı sayar ve tabloya DOKUNMAZ", async () => {
    const { byCode } = buildKeywordsByCode(path.join(DB_DIR, "src/seeds"));
    expect(byCode.get(LEGACY)).toBeTruthy(); // fikstür sağlaması: bu kodun sözlükte eşanlamlısı var
    // Üst düğümler ZATEN güncel (sözlükteki değerle); yalnız yaprağın eşanlamlısı eksik.
    await cat("46000000", "Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları", 1, { keywords: byCode.get("46000000") ?? "" });
    await cat("46180000", "Kişisel güvenlik ve koruma", 2, { keywords: byCode.get("46180000") ?? "" });
    await cat(LEGACY, "Yüz ve baş koruma", 3);
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
