/**
 * Tek seferlik: mevcut Anadolu İnşaat A.Ş. (anadolu@demofill.local) hesabına
 * YENİ bir PUBLIC ALIM ihalesi ekler — hiçbir şeyi silmez (re-seed değil).
 *
 * Çalıştır:  cd packages/db && npx tsx prisma/scripts/add-anadolu-listing.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(__dirname, "../../.env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
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

  // İnşaat/yapı ile ilgili bir kategori seç, yoksa herhangi aktif L2.
  const cat =
    (await prisma.category.findFirst({
      where: {
        level: 2,
        isActive: true,
        OR: [
          { nameTr: { contains: "İnşaat", mode: "insensitive" } },
          { nameTr: { contains: "Yapı", mode: "insensitive" } },
        ],
      },
      select: { code: true, nameTr: true },
    })) ??
    (await prisma.category.findFirst({
      where: { level: 2, isActive: true },
      select: { code: true, nameTr: true },
    }));
  if (!cat) throw new Error("Kategori bulunamadı — seed-categories çalıştırılmalı.");

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
