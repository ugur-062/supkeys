import { PrismaClient } from "@prisma/client";
import { generateTenderNumber } from "@supkeys/shared";

/**
 * 3 dummy tender oluşturur (idempotent — title üzerinden tekrar etmez):
 *  1. SUPK-YYYY-XXXX  IT Sarf Malzeme Alımı 2026 Q2  → OPEN_FOR_BIDS
 *  2. SUPK-YYYY-XXXX  2026 Q2 Ofis Kırtasiye Tedariği → IN_AWARD
 *  3. SUPK-YYYY-XXXX  Yıllık Temizlik Ürünleri Sözleşmesi 2026 → DRAFT
 *
 * Demo Şirket'in COMPANY_ADMIN'i tarafından oluşturulur. Davetler Demo
 * Şirket'in mevcut ACTIVE tedarikçilerinden ilk 3'üne gönderilir.
 */
export async function seedTenders(prisma: PrismaClient): Promise<void> {
  const demoTenant = await prisma.tenant.findUnique({
    where: { slug: "demo" },
  });
  if (!demoTenant) {
    console.warn(
      "ℹ️  Demo tenant bulunamadı, tender seed atlandı.",
    );
    return;
  }

  const adminUser = await prisma.user.findFirst({
    where: { tenantId: demoTenant.id, role: "COMPANY_ADMIN" },
  });
  if (!adminUser) {
    console.warn(
      "ℹ️  Demo Şirket COMPANY_ADMIN bulunamadı, tender seed atlandı.",
    );
    return;
  }

  const relations = await prisma.supplierTenantRelation.findMany({
    where: { tenantId: demoTenant.id, status: "ACTIVE" },
    include: { supplier: { select: { id: true, companyName: true } } },
    take: 5,
  });
  if (relations.length === 0) {
    console.warn(
      "ℹ️  Demo Şirket'in ACTIVE tedarikçisi yok — davet listesi boş bırakılarak seed devam ediyor.",
    );
  }

  const inviteSlice = (limit: number) =>
    relations.slice(0, Math.min(limit, relations.length)).map((r) => ({
      supplierId: r.supplierId,
      status: "PENDING" as const,
      emailSentAt: new Date(),
    }));

  const samples: Array<{
    title: string;
    build: () => Promise<unknown>;
  }> = [
    {
      title: "IT Sarf Malzeme Alımı 2026 Q2",
      build: async () => {
        const tenderNumber = await generateTenderNumber(prisma);
        return prisma.tender.create({
          data: {
            tenderNumber,
            tenantId: demoTenant.id,
            createdById: adminUser.id,
            type: "RFQ",
            status: "OPEN_FOR_BIDS",
            title: "IT Sarf Malzeme Alımı 2026 Q2",
            description:
              "2026 yılı 2. çeyrek için IT departmanı sarf malzeme tedarik ihalesi. Monitör, klavye, fare ve aksesuarlar.",
            termsAndConditions:
              "Ürünler orijinal ve faturalı olmalıdır. Garanti süresi minimum 24 ay olmalıdır.",
            internalNotes: "Pazarlık marjı %15 hedefleniyor.",
            isSealedBid: true,
            requireAllItems: false,
            requireBidDocument: false,
            primaryCurrency: "TRY",
            allowedCurrencies: ["TRY", "USD", "EUR"],
            decimalPlaces: 2,
            deliveryTerm: "DDP",
            deliveryAddress:
              "Demo Şirket Genel Müdürlük\nKısıklı Cd. No:12\n34696 Üsküdar/İstanbul",
            paymentTerm: "DEFERRED",
            paymentDays: 30,
            publishedAt: new Date(),
            bidsOpenAt: new Date(),
            bidsCloseAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            items: {
              create: [
                {
                  orderIndex: 1,
                  name: 'Dell P2422H 24" Monitör',
                  description:
                    "1920×1080 IPS, HDMI + DisplayPort, yükseklik ayarlı stand.",
                  quantity: 60,
                  unit: "adet",
                  materialCode: "IT-MON-001",
                  customQuestion:
                    "Garanti süresi nedir? Yedek parça temini mümkün mü?",
                  targetUnitPrice: 7500,
                },
                {
                  orderIndex: 2,
                  name: "Logitech MX Keys Klavye",
                  description: "Türkçe Q kablosuz klavye.",
                  quantity: 60,
                  unit: "adet",
                  materialCode: "IT-KB-001",
                  customQuestion: "Pil ömrü ortalama ne kadardır?",
                },
                {
                  orderIndex: 3,
                  name: "Logitech MX Master 3S",
                  description: "Kablosuz mouse, ergonomik.",
                  quantity: 60,
                  unit: "adet",
                  materialCode: "IT-MS-001",
                },
                {
                  orderIndex: 4,
                  name: "USB-C Hub 4-in-1",
                  description: "HDMI + USB 3.0 ×2 + USB-C PD.",
                  quantity: 30,
                  unit: "adet",
                },
              ],
            },
            invitations: { create: inviteSlice(3) },
          },
        });
      },
    },
    {
      title: "2026 Q2 Ofis Kırtasiye Tedariği",
      build: async () => {
        const tenderNumber = await generateTenderNumber(prisma);
        return prisma.tender.create({
          data: {
            tenderNumber,
            tenantId: demoTenant.id,
            createdById: adminUser.id,
            type: "RFQ",
            status: "IN_AWARD",
            title: "2026 Q2 Ofis Kırtasiye Tedariği",
            description: "Çeyreklik ofis kırtasiye toplu alımı.",
            isSealedBid: true,
            primaryCurrency: "TRY",
            allowedCurrencies: ["TRY"],
            decimalPlaces: 2,
            deliveryTerm: "DDP",
            paymentTerm: "CASH",
            publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            bidsOpenAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            bidsCloseAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            items: {
              create: [
                {
                  orderIndex: 1,
                  name: "A4 Beyaz Fotokopi Kağıdı 80gr",
                  quantity: 200,
                  unit: "paket",
                },
                {
                  orderIndex: 2,
                  name: "Tükenmez Kalem Mavi",
                  quantity: 500,
                  unit: "adet",
                },
              ],
            },
            invitations: {
              create: relations
                .slice(0, Math.min(2, relations.length))
                .map((r) => ({
                  supplierId: r.supplierId,
                  status: "EXPIRED" as const,
                  emailSentAt: new Date(
                    Date.now() - 14 * 24 * 60 * 60 * 1000,
                  ),
                })),
            },
          },
        });
      },
    },
    {
      title: "Yıllık Temizlik Ürünleri Sözleşmesi 2026",
      build: async () => {
        const tenderNumber = await generateTenderNumber(prisma);
        return prisma.tender.create({
          data: {
            tenderNumber,
            tenantId: demoTenant.id,
            createdById: adminUser.id,
            type: "RFQ",
            status: "DRAFT",
            title: "Yıllık Temizlik Ürünleri Sözleşmesi 2026",
            description: "12 aylık temizlik ürünleri tedarik sözleşmesi.",
            isSealedBid: true,
            primaryCurrency: "TRY",
            allowedCurrencies: ["TRY"],
            decimalPlaces: 2,
            deliveryTerm: "DDP",
            paymentTerm: "DEFERRED",
            paymentDays: 45,
            bidsCloseAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            items: {
              create: [
                {
                  orderIndex: 1,
                  name: "Tuvalet Kağıdı 16'lı Paket",
                  quantity: 100,
                  unit: "paket",
                },
                {
                  orderIndex: 2,
                  name: "Çamaşır Suyu 5L",
                  quantity: 50,
                  unit: "şişe",
                },
              ],
            },
          },
        });
      },
    },
  ];

  const created: string[] = [];
  for (const sample of samples) {
    const existing = await prisma.tender.findFirst({
      where: { tenantId: demoTenant.id, title: sample.title },
      select: { tenderNumber: true },
    });
    if (existing) {
      console.log(
        `ℹ️  Tender zaten var: ${existing.tenderNumber} (${sample.title})`,
      );
      continue;
    }
    const tender = (await sample.build()) as { tenderNumber: string };
    created.push(tender.tenderNumber);
  }
  if (created.length > 0) {
    console.log(`✓ ${created.length} dummy tender oluşturuldu (${created.join(", ")})`);
  }
}
