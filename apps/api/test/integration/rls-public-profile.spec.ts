/**
 * RLS Faz 2 (Aşama B) — public katalog bypass KANITI. public-profile.service
 * herkese açık olarak HER firmanın public profilini/dizinini okur (viewer'ın
 * tenant'ı yok/ilgisiz). companies gerçek policy'ye alınınca RLS'li client
 * bağlamsız → BOŞ → public sayfa 404/boş. FIX: bypass client. Geçici companies
 * kök-policy'siyle kanıt-çifti, sonra permissive'e geri al.
 */
import { PrismaClient } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";
import { ensureRestrictedRolePassword, makeRestrictedPrisma } from "./rls-db";

let restricted: PrismaClient;

beforeAll(async () => {
  await ensureRestrictedRolePassword(prisma as never);
  restricted = makeRestrictedPrisma();
  await restricted.$connect();
});
afterAll(async () => {
  await restricted.$disconnect();
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function withRealCompaniesPolicy(fn: () => Promise<void>) {
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "companies_rls" ON "companies"`);
  await prisma.$executeRawUnsafe(
    `CREATE POLICY "companies_rls" ON "companies" USING ("id" = current_setting('app.current_company_id', true))`,
  );
  try {
    await fn();
  } finally {
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "companies_rls" ON "companies"`);
    await prisma.$executeRawUnsafe(`CREATE POLICY "companies_rls" ON "companies" USING (true)`);
  }
}

describe("Faz 2 — public katalog bypass kanıtı", () => {
  it("KANIT-ÇİFTİ: dizin okuma → BYPASS/owner tüm firmaları görür, RLS'li bağlamsız BOŞ", async () => {
    await makeCompany(prisma, { name: "A" });
    await makeCompany(prisma, { name: "B" });

    await withRealCompaniesPolicy(async () => {
      // public-profile.service bypass kullanır → owner cross-tenant dizin okur.
      const viaBypass = await prisma.company.findMany({ select: { id: true } });
      expect(viaBypass.length).toBe(2);

      // RLS'li kısıtlı, bağlam yok → id=NULL → hiçbir firma (public sayfa boş kalırdı).
      const viaRls = await restricted.company.findMany({ select: { id: true } });
      expect(viaRls).toEqual([]);
    });
  });
});
