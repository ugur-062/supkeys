/**
 * Tek seferlik: mevcut Anadolu İnşaat A.Ş. (anadolu@demofill.local) hesabına
 * YENİ bir PUBLIC ALIM ihalesi ekler — hiçbir şeyi silmez (re-seed değil).
 *
 * Çalıştır:  cd packages/db && npx tsx prisma/scripts/add-anadolu-listing.ts
 *
 * GİZLİ SEGMENT (2026-10-09): kategori yalnız GÖRÜNÜR segmentlerden seçilir
 * (`visibleActiveFamilyWhere`, kod sırasıyla) ve yazımdan önce denetlenir.
 * Süzgeçsiz hâliyle ad eşleşmesi gizli 82160000 / 85320000'e, yedek ise
 * gizli 10100000'e düşebiliyordu.
 */
import { PrismaClient } from "@prisma/client";
import { prepareScriptDatabase } from "./lib/script-env";
import { assertVisibleSeedCategory, visibleActiveFamilyWhere } from "./lib/seed-category-guard";

const prisma = new PrismaClient({ datasourceUrl: prepareScriptDatabase("add-anadolu-listing") });
const days = (n: number) => new Date(Date.now() + n * 86400_000);

async function nextNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('listing_number_seq') AS n`;
  return `ROT-${String(rows[0]!.n).padStart(6, "0")}`;
}

const TITLE = "Şantiye kalıp, iskele ve kalıp malzemeleri alımı";
const ITEMS = [
  { name: "Çelik iskele sistemi (H tipi)", quantity: 400, unit: "m²", targetPrice: 320 },
  { name: "Ahşap kalıp kontrplağı 18 mm", quantity: 1200, unit: "adet", targetPrice: 480 },
  { name: "Kalıp yağı (biyolojik)", quantity: 2000, unit: "L", targetPrice: 65 },
  { name: "İskele bağlantı kelepçesi", quantity: 6000, unit: "adet", targetPrice: 42 },
];

async function main() {
  // Anadolu firmasını owner e-postasından bul.
  const owner = await prisma.companyUser.findFirst({
    where: { email: "anadolu@demofill.local" },
    select: { id: true, companyId: true, company: { select: { name: true } } },
  });
  if (!owner) throw new Error("anadolu@demofill.local bulunamadı — önce seed-demo-fill çalıştırılmalı.");

  // İnşaat/yapı ile ilgili GÖRÜNÜR bir kategori seç, yoksa herhangi aktif görünür L2.
  const cat =
    (await prisma.category.findFirst({
      where: {
        ...visibleActiveFamilyWhere(),
        OR: [
          { nameTr: { contains: "İnşaat", mode: "insensitive" } },
          { nameTr: { contains: "Yapı", mode: "insensitive" } },
        ],
      },
      select: { code: true, nameTr: true },
      orderBy: { code: "asc" },
    })) ??
    (await prisma.category.findFirst({
      where: visibleActiveFamilyWhere(),
      select: { code: true, nameTr: true },
      orderBy: { code: "asc" },
    }));
  if (!cat) throw new Error("Kategori bulunamadı — seed-categories çalıştırılmalı.");
  assertVisibleSeedCategory("add-anadolu-listing", "listing category", cat.code);

  const number = await nextNumber();
  const listing = await prisma.listing.create({
    data: {
      number,
      companyId: owner.companyId,
      createdById: owner.id,
      type: "ALIM",
      format: "RFQ",
      visibility: "PUBLIC",
      title: TITLE,
      status: "OPEN",
      publishedAt: new Date(),
      closesAt: days(17),
      primaryCurrency: "TRY",
      paymentTiming: "BEFORE_DELIVERY", // teslim öncesi → kazanan satıcı teminat + banka hesabı ile onaylar
      categoryIds: [cat.code],
    },
  });

  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i]!;
    await prisma.listingItem.create({
      data: {
        listingId: listing.id,
        lineNo: i + 1,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        targetPrice: it.targetPrice,
      },
    });
  }

  console.log(`✅ İhale eklendi: ${number} — "${TITLE}"`);
  console.log(`   Firma: ${owner.company.name} (${owner.companyId})`);
  console.log(`   Kategori: ${cat.nameTr} (${cat.code})`);
  console.log(`   Görünürlük: PUBLIC · Ödeme: Teslim öncesi · ${ITEMS.length} kalem · Kapanış: ${days(17).toLocaleDateString("tr-TR")}`);
  console.log(`   Listing id: ${listing.id}`);
}

main()
  .catch((e) => {
    console.error("HATA:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
