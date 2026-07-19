/**
 * RLS Faz 2b — ENABLE RLS + permissive USING(true), KISITLI rolle koşulur.
 * Kanıt: RLS aktif AMA permissive → kısıtlı rol grant'lerle HER firmanın verisini
 * görür (grant-gap olsaydı permission denied patlardı). Gerçek izolasyon Faz 2d.
 *
 * NOT: hâlâ PERMISSIVE bir tablo kullanılır (company_membership_events —
 * admin/system yazar, gerçek policy'ye Faz 2 sonuna ertelendi). addresses/bank
 * 2d-1'de gerçek policy'ye geçti → izolasyon kanıtı rls-isolation.spec'te.
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

const eventFor = (companyId: string, reason: string) =>
  prisma.companyMembershipEvent.create({ data: { companyId, action: "GRANT", reason } });

describe("Faz 2b — RLS enabled + permissive (kısıtlı rol)", () => {
  it("RLS aktif ama permissive → kısıtlı rol İKİ firmanın da kaydını görür (grant tam)", async () => {
    const a = await makeCompany(prisma, { name: "A" });
    const b = await makeCompany(prisma, { name: "B" });
    await eventFor(a.id, "A-olay");
    await eventFor(b.id, "B-olay");

    const rows = await restricted.companyMembershipEvent.findMany({
      orderBy: { reason: "asc" },
    });
    expect(rows.map((r) => r.reason)).toEqual(["A-olay", "B-olay"]);
  });

  it("kısıtlı rol INSERT edebilir (WITH CHECK=USING=true, DML grant tam)", async () => {
    const a = await makeCompany(prisma, { name: "A" });
    const created = await restricted.companyMembershipEvent.create({
      data: { companyId: a.id, action: "GRANT", reason: "kısıtlı-insert" },
    });
    expect(created.id).toBeTruthy();
  });
});
