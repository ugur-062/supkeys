/**
 * RLS Faz 2a — kısıtlı rol `rothern_app` doğrulaması. Migration rolü + grant'leri
 * kurdu. Bu spec: rol bağlanır, DML çalışır (grant tam), ve rol RLS'e TABİ
 * (NOSUPERUSER + NOBYPASSRLS). Henüz policy YOK → permissive gibi her şeyi görür.
 */
import { PrismaClient } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import {
  ensureRestrictedRolePassword,
  makeRestrictedPrisma,
} from "./rls-db";

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

describe("Faz 2a — kısıtlı rol rothern_app", () => {
  it("bağlanır + SELECT çalışır (USAGE + SELECT grant tam)", async () => {
    const n = await restricted.company.count();
    expect(typeof n).toBe("number");
  });

  it("INSERT/DELETE çalışır (DML grant tam) — policy YOK, permissive", async () => {
    const c = await restricted.company.create({
      data: { name: "RLS Rol Testi", tier: "STANDARD", rothernId: "RLSA-0001" },
    });
    expect(c.id).toBeTruthy();
    await restricted.company.delete({ where: { id: c.id } });
  });

  it("rol NOSUPERUSER + NOBYPASSRLS (RLS'e tabi olacak)", async () => {
    const rows = await restricted.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });
});
