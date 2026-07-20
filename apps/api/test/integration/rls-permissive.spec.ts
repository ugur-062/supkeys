/**
 * RLS Faz 2b — ENABLE RLS + permissive USING(true), KISITLI rolle koşulur.
 * Kanıt: RLS aktif AMA permissive → kısıtlı rol grant'lerle HER firmanın verisini
 * görür (grant-gap olsaydı permission denied patlardı). Gerçek izolasyon Faz 2d.
 *
 * NOT: hâlâ PERMISSIVE bir tablo kullanılır (notifications — cron/order.scheduler
 * yazar, sistem-bypass bağlamı gerektirdiğinden gerçek policy'ye EN SON alınır).
 * addresses/bank/templates/approval gerçek policy'ye geçti → izolasyon kanıtı
 * rls-isolation.spec'te.
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

async function notifFor(companyId: string, title: string) {
  const u = await makeUser(prisma, companyId);
  return prisma.notification.create({
    data: { companyUserId: u.id, companyId, type: "test", title, body: "b" },
  });
}

describe("Faz 2b — RLS enabled + permissive (kısıtlı rol)", () => {
  it("RLS aktif ama permissive → kısıtlı rol İKİ firmanın da kaydını görür (grant tam)", async () => {
    const a = await makeCompany(prisma, { name: "A" });
    const b = await makeCompany(prisma, { name: "B" });
    await notifFor(a.id, "A-bildirim");
    await notifFor(b.id, "B-bildirim");

    const rows = await restricted.notification.findMany({
      orderBy: { title: "asc" },
    });
    expect(rows.map((r) => r.title)).toEqual(["A-bildirim", "B-bildirim"]);
  });

  it("kısıtlı rol INSERT edebilir (WITH CHECK=USING=true, DML grant tam)", async () => {
    const a = await makeCompany(prisma, { name: "A" });
    const u = await makeUser(prisma, a.id);
    const created = await restricted.notification.create({
      data: {
        companyUserId: u.id,
        companyId: a.id,
        type: "test",
        title: "kısıtlı-insert",
        body: "b",
      },
    });
    expect(created.id).toBeTruthy();
  });
});
