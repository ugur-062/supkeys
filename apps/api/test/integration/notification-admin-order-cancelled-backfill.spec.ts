/**
 * Arayüz testi kapanış (api-1 NEW-2) — eski admin_order_cancelled bildirimleri
 * portal NULL + genel "Rothern'e Git" → /company yazılmıştı; alıcının metni
 * Satış süzgecinde rozetsiz görünüyordu. Backfill satırı gövdedeki sipariş
 * numarasıyla siparişe bağlar: alıcı satırı satinalma, satıcı satırı satis;
 * varsayılan CTA siparişin detayına (alıcının dil biçiminde) çevrilir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const SQL = readFileSync(
  join(
    __dirname,
    "../../../../packages/db/prisma/migrations/20261003090000_notification_admin_order_cancelled_portal_backfill/migration.sql",
  ),
  "utf8",
);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

it("alıcı/satıcı satırı taraf portalına ve siparişe bağlanır; eşleşmeyen ve dolu portal olduğu gibi", async () => {
  const buyer = await makeCompanyWithUser(prisma, {});
  const seller = await makeCompanyWithUser(prisma, {});
  const order = await prisma.companyOrder.create({
    data: {
      buyerCompanyId: buyer.company.id,
      sellerCompanyId: seller.company.id,
      number: "ROT-ORD-000218",
      amount: 1000,
      currency: "TRY",
      status: "CANCELLED",
    },
  });
  const row = (
    co: typeof buyer,
    extra: { type?: string; portal?: string | null; body?: string; ctaUrl?: string; ctaLabel?: string },
  ) =>
    prisma.notification.create({
      data: {
        companyUserId: co.user.id,
        companyId: co.company.id,
        type: extra.type ?? "admin_order_cancelled",
        portal: extra.portal ?? null,
        title: "Sipariş yönetici tarafından iptal edildi",
        body: extra.body ?? "ROT-ORD-000218 numaralı sipariş platform yöneticisi tarafından iptal edildi.",
        ctaUrl: extra.ctaUrl ?? "http://localhost:3000/company",
        ctaLabel: extra.ctaLabel ?? "Rothern'e Git",
      },
    });
  const toBuyer = await row(buyer, {});
  const toSellerEn = await row(seller, {
    body: "Order ROT-ORD-000218 was cancelled by the platform administrator.",
    ctaUrl: "http://localhost:3000/en/company",
    ctaLabel: "Go to Rothern",
  });
  const toBuyerRu = await row(buyer, {
    body: "Заказ ROT-ORD-000218 отменён администратором платформы.",
    ctaUrl: "http://localhost:3000/ru/kompaniya",
    ctaLabel: "Перейти в Rothern",
  });
  const unnumbered = await row(buyer, { body: "İlgili sipariş platform yöneticisi tarafından iptal edildi." });
  const alreadySet = await row(buyer, { portal: "satis" });
  const otherType = await row(buyer, { type: "admin_company_suspended" });

  await prisma.$executeRawUnsafe(SQL);
  await prisma.$executeRawUnsafe(SQL); // idempotent

  const get = (id: string) =>
    prisma.notification.findUniqueOrThrow({
      where: { id },
      select: { portal: true, ctaUrl: true, ctaLabel: true },
    });
  expect(await get(toBuyer.id)).toEqual({
    portal: "satinalma",
    ctaUrl: `http://localhost:3000/company/siparis/${order.id}`,
    ctaLabel: "Siparişi Gör",
  });
  expect(await get(toSellerEn.id)).toEqual({
    portal: "satis",
    ctaUrl: `http://localhost:3000/en/company/order/${order.id}`,
    ctaLabel: "View order",
  });
  expect(await get(toBuyerRu.id)).toEqual({
    portal: "satinalma",
    ctaUrl: `http://localhost:3000/ru/kompaniya/zakaz/${order.id}`,
    ctaLabel: "Открыть заказ",
  });
  expect(await get(unnumbered.id)).toMatchObject({ portal: null, ctaUrl: "http://localhost:3000/company" });
  expect(await get(alreadySet.id)).toMatchObject({ portal: "satis", ctaUrl: "http://localhost:3000/company" });
  expect(await get(otherType.id)).toMatchObject({ portal: null, ctaLabel: "Rothern'e Git" });
});
