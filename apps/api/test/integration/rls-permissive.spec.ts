/**
 * RLS Faz 2b — ENABLE RLS + permissive USING(true), KISITLI rolle koşulur.
 * Kanıt: RLS aktif AMA permissive → kısıtlı rol grant'lerle HER firmanın verisini
 * görür (grant-gap olsaydı permission denied patlardı). Gerçek izolasyon Faz 2d.
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

async function addressFor(companyId: string, title: string) {
  return prisma.companyAddress.create({
    data: {
      companyId,
      title,
      type: "TESLIMAT",
      addressLine: "X",
      city: "İstanbul",
      country: "TR",
    },
  });
}

describe("Faz 2b — RLS enabled + permissive (kısıtlı rol)", () => {
  it("RLS aktif ama permissive → kısıtlı rol İKİ firmanın da adresini görür (grant tam)", async () => {
    const a = await makeCompany(prisma, { name: "A" });
    const b = await makeCompany(prisma, { name: "B" });
    await addressFor(a.id, "A-adres");
    await addressFor(b.id, "B-adres");

    // Kısıtlı rol (RLS'e tabi) — permissive USING(true) → hepsini görür.
    const rows = await restricted.companyAddress.findMany({
      orderBy: { title: "asc" },
    });
    expect(rows.map((r) => r.title)).toEqual(["A-adres", "B-adres"]);
  });

  it("kısıtlı rol INSERT edebilir (WITH CHECK=USING=true, DML grant tam)", async () => {
    const a = await makeCompany(prisma, { name: "A" });
    const created = await restricted.companyAddress.create({
      data: {
        companyId: a.id,
        title: "kısıtlı-insert",
        type: "TESLIMAT",
        addressLine: "X",
        city: "İzmir",
        country: "TR",
      },
    });
    expect(created.id).toBeTruthy();
  });
});
