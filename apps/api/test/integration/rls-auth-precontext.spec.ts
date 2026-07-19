/**
 * RLS Faz 2 (Aşama A) — AUTH PRE-CONTEXT bypass KANITI. login/signup/verify
 * companyUser'ı EMAIL ile bağlamsız (tenant-öncesi) arar. company_users gerçek
 * policy'ye alınınca (2d-2): bu lookup RLS'li main client'ta BOŞ döner →
 * "kullanıcı bulunamadı" → giriş kırılır → prod'da kimse giremez. FIX: bypass
 * client (owner, RLS'siz). Bu spec company_users'a GEÇİCİ gerçek policy koyup
 * kanıt-çiftini gösterir (bypass BULUR / RLS'li BULAMAZ), sonra permissive'e
 * geri alır (company_users kalıcı policy 2d-2).
 */
import { PrismaClient } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeUser } from "./factories";
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

async function withRealUserPolicy(fn: () => Promise<void>) {
  // GEÇİCİ: permissive → gerçek policy; test sonrası geri al (finally).
  await prisma.$executeRawUnsafe(
    `DROP POLICY IF EXISTS "company_users_rls" ON "company_users"`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE POLICY "company_users_rls" ON "company_users" USING ("companyId" = current_setting('app.current_company_id', true)) WITH CHECK ("companyId" = current_setting('app.current_company_id', true))`,
  );
  try {
    await fn();
  } finally {
    await prisma.$executeRawUnsafe(
      `DROP POLICY IF EXISTS "company_users_rls" ON "company_users"`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE POLICY "company_users_rls" ON "company_users" USING (true)`,
    );
  }
}

describe("Faz 2 — auth pre-context bypass kanıtı", () => {
  it("KANIT-ÇİFTİ: email lookup → BYPASS/owner BULUR, RLS'li kısıtlı (bağlamsız) BULAMAZ", async () => {
    const co = await makeCompany(prisma, { name: "A" });
    const u = await makeUser(prisma, co.id);

    await withRealUserPolicy(async () => {
      // BYPASS (owner) — company-auth.service pre-context bunu kullanır.
      const viaBypass = await prisma.companyUser.findUnique({
        where: { email: u.email },
        select: { id: true },
      });
      expect(viaBypass?.id).toBe(u.id); // BULUR → giriş çalışır

      // RLS'li kısıtlı client, bağlam YOK (pre-context'te GUC set edilemez) →
      // policy companyId=NULL → BOŞ. Eğer auth main client kullansaydı: null →
      // "kullanıcı bulunamadı" → giriş KIRILIR.
      const viaRls = await restricted.companyUser.findUnique({
        where: { email: u.email },
        select: { id: true },
      });
      expect(viaRls).toBeNull(); // BULAMAZ → bypass ŞART
    });
  });

  it("signup existence-check de bypass ile cross-tenant çalışır (email benzersizliği)", async () => {
    const co = await makeCompany(prisma, { name: "A" });
    const u = await makeUser(prisma, co.id);
    await withRealUserPolicy(async () => {
      // Farklı tenant'tan signup yapan biri aynı email'i kullanamamalı — bypass
      // cross-tenant existence görür (RLS'li olsa göremez → mükerrer hesap açılırdı).
      const existing = await prisma.companyUser.findUnique({
        where: { email: u.email },
        select: { id: true },
      });
      expect(existing?.id).toBe(u.id);
    });
  });
});
