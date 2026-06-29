import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findUnique({
    where: { supkeysId: "8H48-W6ZD" },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("İkinci Firma Ltd bulunamadı (8H48-W6ZD)");

  const user = await prisma.companyUser.findFirst({
    where: { companyId: company.id },
    select: { id: true },
  });
  if (!user) throw new Error("İkinci Firma için CompanyUser yok");

  const now = Date.now();
  const day = 86_400_000;

  const samples = [
    {
      number: "ROT-900101",
      type: "SATIS" as const,
      title: "Endüstriyel CNC Tezgah Stok Satışı",
      description:
        "İkinci el bakımlı CNC dik işleme merkezleri — partiler hâlinde satışa sunulmuştur.",
      minPrice: "450000.00",
      buyNowPrice: "520000.00",
      closesAt: new Date(now + 7 * day),
    },
    {
      number: "ROT-900102",
      type: "ALIM" as const,
      format: "RFQ" as const,
      title: "Paslanmaz Çelik Sac (304/316) Tedariki",
      description:
        "Muhtelif kalınlıklarda paslanmaz çelik sac alımı için teklif toplanmaktadır.",
      closesAt: new Date(now + 10 * day),
    },
    {
      number: "ROT-900103",
      type: "SATIS" as const,
      title: "Ofis Mobilyası Toplu Tasfiye",
      description:
        "Yenileme nedeniyle çıkan ofis mobilyaları (masa, dolap, sandalye) toplu satış.",
      minPrice: "75000.00",
      closesAt: new Date(now + 14 * day),
    },
  ];

  for (const s of samples) {
    const existing = await prisma.listing.findUnique({
      where: { number: s.number },
    });
    if (existing) {
      console.log(`atlandı (zaten var): ${s.number}`);
      continue;
    }
    await prisma.listing.create({
      data: {
        number: s.number,
        companyId: company.id,
        createdById: user.id,
        type: s.type,
        format: s.format ?? null,
        visibility: "PUBLIC",
        status: "OPEN",
        title: s.title,
        description: s.description,
        minPrice: s.minPrice ?? null,
        buyNowPrice: s.buyNowPrice ?? null,
        closesAt: s.closesAt,
      },
    });
    console.log(`oluşturuldu: ${s.number} — ${s.title}`);
  }

  console.log(`\n✓ ${company.name} için örnek ilanlar hazır.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
