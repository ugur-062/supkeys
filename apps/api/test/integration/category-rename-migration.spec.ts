/**
 * Sahip kararları (2026-10-09 "Lojistik", 2026-10-10 "İş Güvenliği ve Yangın
 * Ekipmanları") — kategori adları tohum dosyalarından operatör betikleriyle
 * yazılır; 46'yı yeniden GÖRÜNÜR yapan sürüm betikler koşulana dek sektörü eski
 * adıyla (kolluk / law enforcement) gösterirdi. `20261010120000` üç satırı
 * görünürlük değişikliğiyle aynı anda (API açılışındaki migrate deploy) yazar.
 *
 * Kilitlenenler: eski adlı satırlar yeni adları alır; arama metni yazılan ad +
 * anahtar kelimelerle TUTARLIDIR (tek kaynak `categorySearchText` — betikler
 * sonradan koşulunca satır değişmez); eski kolluk adı aramada kalmaz; başka
 * satıra dokunulmaz; boş tabloda ve ikinci koşuda sorun çıkmaz.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categorySearchText, foldSearchText } from "@rothern/shared";
import { prisma, truncateAll } from "./test-db";

const SQL = readFileSync(
  join(
    __dirname,
    "../../../../packages/db/prisma/migrations/20261010120000_category_rename_safety_logistics/migration.sql",
  ),
  "utf8",
);
/** Dosyadaki ifadeler (yorum satırları atılır; hazır ifade tek komut alır). */
const STATEMENTS = SQL.split("\n")
  .filter((line) => !line.startsWith("--"))
  .join("\n")
  .split(/;\s*(?:\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

async function runMigration() {
  for (const statement of STATEMENTS) await prisma.$executeRawUnsafe(statement);
}

async function makeCategory(code: string, nameTr: string, level: number, extra: { nameEn?: string; keywords?: string } = {}) {
  return prisma.category.create({
    data: {
      id: code,
      code,
      nameTr,
      nameEn: extra.nameEn ?? null,
      keywords: extra.keywords ?? "",
      searchText: foldSearchText([nameTr, extra.keywords, extra.nameEn].filter(Boolean).join(" ")),
      level,
      isActive: true,
      sortOrder: 0,
      inDiscovery: true,
    },
  });
}

const row = (code: string) =>
  prisma.category.findUniqueOrThrow({
    where: { code },
    select: { nameTr: true, nameEn: true, nameRu: true, keywords: true, searchText: true },
  });

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

it("dosya yalnız üç kodu yazar", () => {
  expect(STATEMENTS).toHaveLength(3);
  expect(STATEMENTS.map((s) => /WHERE "code" = '(\d{8})'$/.exec(s)?.[1])).toEqual(["46000000", "78000000", "81141601"]);
  for (const statement of STATEMENTS) expect(statement.startsWith('UPDATE "categories"')).toBe(true);
});

it("eski adlı satırlar yeni adları alır; arama metni yazılan değerlerle tutarlı; başka satır değişmez", async () => {
  await makeCategory("46000000", "Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları", 1, {
    nameEn: "Law Enforcement and National Security and Security and Safety Equipment and Supplies",
    keywords: "Law Enforcement and National Security and Security and Safety Equipment and Supplies",
  });
  await makeCategory("78000000", "Taşıma, Depolama ve Posta Hizmetleri", 1);
  await makeCategory("81141601", "Lojistik", 4);
  await makeCategory("31000000", "İmalat Bileşenleri ve Malzemeleri", 1, { keywords: "imalat" });
  const untouchedBefore = await row("31000000");

  await runMigration();
  await runMigration(); // idempotent

  expect(await row("46000000")).toMatchObject({
    nameTr: "İş Güvenliği ve Yangın Ekipmanları",
    nameEn: "Workplace Safety and Fire Equipment",
    nameRu: "Средства охраны труда и противопожарное оборудование",
  });
  expect(await row("78000000")).toMatchObject({ nameTr: "Lojistik", nameEn: "Logistics", nameRu: "Логистика" });
  expect(await row("81141601")).toMatchObject({
    nameTr: "Lojistik yönetimi",
    nameEn: "Logistics management",
    nameRu: "Управление логистикой",
  });

  for (const code of ["46000000", "78000000", "81141601"]) {
    const written = await row(code);
    // Betiklerin yazacağı değer: aynı tek kaynak fonksiyon, yazılan ad + anahtar kelimelerden.
    expect({ code, searchText: written.searchText }).toEqual({ code, searchText: categorySearchText(written) });
  }

  // Eski kolluk adı görünür sektörün aramasında kalmaz; güvenlik sözcükleri kalır.
  const safety = await row("46000000");
  expect(safety.searchText).not.toMatch(/law enforcement|national security|kolluk/);
  expect(safety.keywords).not.toMatch(/law enforcement|national security|kolluk|silah|weapon/i);
  expect(safety.searchText).toContain("is guvenligi");
  expect(safety.searchText).toContain("fire protection");
  // 78'in eski adı aranmaya devam eder (taşıma / depolama arayan Lojistik'i bulur).
  expect((await row("78000000")).searchText).toContain("tasima, depolama ve posta hizmetleri");

  expect(await row("31000000")).toEqual(untouchedBefore);
});

it("kategori tablosu boşken (CI, yeni kurulum) hiçbir satır yazılmaz", async () => {
  await runMigration();
  expect(await prisma.category.count()).toBe(0);
});
