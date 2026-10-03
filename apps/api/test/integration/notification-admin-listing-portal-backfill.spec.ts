/**
 * Arayüz testi son tur — eski admin_listing_* / ai_supplier_suggestions
 * bildirimleri portal NULL kaldığı için Satış süzgecinde rozetsiz görünüyordu.
 * Backfill migration'ı yalnız bu tiplerin portal NULL satırlarını
 * 'satinalma'ya taşır; başka tiplere ve dolu portala dokunmaz (idempotent).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const SQL = readFileSync(
  join(
    __dirname,
    "../../../../packages/db/prisma/migrations/20261002160000_notification_admin_listing_portal_backfill/migration.sql",
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

it("admin talep müdahalesi + AI öneri satırları satinalma'ya taşınır; diğerleri olduğu gibi", async () => {
  const co = await makeCompanyWithUser(prisma, {});
  const base = { companyUserId: co.user.id, companyId: co.company.id, title: "t", body: "b" };
  const rows: [string, "satis" | "satinalma" | null][] = [
    ["admin_listing_closed", null],
    ["admin_listing_extended", null],
    ["admin_listing_reopened", null],
    ["ai_supplier_suggestions", null],
    ["admin_company_suspended", null],
    ["admin_listing_closed", "satis"],
  ];
  for (const [type, portal] of rows) {
    await prisma.notification.create({ data: { ...base, type, portal } });
  }
  await prisma.$executeRawUnsafe(SQL);
  await prisma.$executeRawUnsafe(SQL); // idempotent
  const after = await prisma.notification.findMany({
    select: { type: true, portal: true },
    orderBy: { createdAt: "asc" },
  });
  const pairs = after.map((n) => `${n.type}:${n.portal ?? "null"}`).sort();
  expect(pairs).toEqual(
    [
      "admin_listing_closed:satinalma",
      "admin_listing_extended:satinalma",
      "admin_listing_reopened:satinalma",
      "ai_supplier_suggestions:satinalma",
      "admin_company_suspended:null",
      "admin_listing_closed:satis",
    ].sort(),
  );
});
