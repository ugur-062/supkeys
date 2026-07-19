/**
 * RLS Faz 1b — Postgres MEKANİZMA kanıtı (gerçek DB). RLS extension'ın neden
 * set_config'i sorguyla AYNI tx'e sarması GEREKTİĞİni gösterir:
 *  - set_config(...,true) + okuma AYNI tx'te → bind olur.
 *  - AYRI statement'ta (tx dışı) set_config(...,true) → is_local → SIZMAZ.
 * Ayrıca extension'ı gerçek client'a uygulayıp (RLS_ENABLED=true) uçtan uca
 * set_config'in bir model op'unun içinde geçerli olduğunu doğrular.
 */
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { createRlsExtension, RLS_GUC } from "../../src/common/prisma/rls-extension";
import { runWithTenantContext } from "../../src/common/tenant/tenant-context";

const readGuc = (
  db: { $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<{ v: string }[]> },
) =>
  db.$queryRaw`SELECT current_setting(${Prisma.raw(`'${RLS_GUC}'`)}, true) AS v`;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("RLS mekanizması — set_config tx-bağlama", () => {
  it("set_config(...,true) + okuma AYNI tx'te → değer görünür", async () => {
    const [, rows] = (await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config(${RLS_GUC}, ${"c-bound"}, true)`,
      prisma.$queryRaw`SELECT current_setting(${Prisma.raw(`'${RLS_GUC}'`)}, true) AS v`,
    ])) as [number, { v: string }[]];
    expect(rows[0]!.v).toBe("c-bound");
  });

  it("tx DIŞINDA set_config(...,true) → sonraki AYRI sorguya SIZMAZ (is_local)", async () => {
    await prisma.$executeRaw`SELECT set_config(${RLS_GUC}, ${"leak"}, true)`;
    const rows = (await readGuc(prisma as never)) as { v: string }[];
    // Ayrı statement/implicit-tx → local setting görünmez → boş default.
    expect(rows[0]!.v).toBe("");
  });
});

describe("RLS extension — uçtan uca (RLS_ENABLED=true)", () => {
  const prev = process.env.RLS_ENABLED;
  beforeAll(() => {
    process.env.RLS_ENABLED = "true";
  });
  afterAll(() => {
    // prev undefined ise sil (aksi halde "undefined" string'i sızardı).
    if (prev === undefined) delete process.env.RLS_ENABLED;
    else process.env.RLS_ENABLED = prev;
  });

  // NOT: PrismaPromise LAZY — op AWAIT anında çalışır. Bağlamın op çalışırken
  // aktif olması için `await` als.run callback'inin İÇİNDE olmalı (gerçek
  // uygulamada handler request-ALS içinde await eder → doğru).
  it("extension model op'u set_config'li tx'e sarar (company bağlamı)", async () => {
    const rls = prisma.$extends(createRlsExtension());
    const count = await runWithTenantContext(
      { companyId: "c-e2e", realm: "company" },
      async () => await rls.company.count(),
    );
    expect(typeof count).toBe("number");
  });

  it("company realm + companyId YOK → model op FIRLAR (fail-closed)", async () => {
    const rls = prisma.$extends(createRlsExtension());
    await expect(
      runWithTenantContext(
        { companyId: null, realm: "company" },
        async () => await rls.company.count(),
      ),
    ).rejects.toThrow(/tenant bağlamı|fail-closed/);
  });

  it("bağlam yok → passthrough (FIRLATMAZ, normal çalışır)", async () => {
    const rls = prisma.$extends(createRlsExtension());
    const count = await rls.company.count();
    expect(typeof count).toBe("number");
  });
});
