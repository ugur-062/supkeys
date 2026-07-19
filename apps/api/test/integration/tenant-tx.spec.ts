/**
 * RLS Faz 1c-2 — runTenantTx. Kanıt: flag OFF → düz tx (davranış birebir);
 * flag ON + company → tx içinde GUC set + inner op NESTED-TX YAPMAZ (inTx) +
 * GUC tx boyunca görünür; admin/bağlamsız → bypass (GUC set edilmez).
 */
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { runTenantTx } from "../../src/common/prisma/tenant-tx";
import { createRlsExtension, RLS_GUC } from "../../src/common/prisma/rls-extension";
import { runWithTenantContext } from "../../src/common/tenant/tenant-context";

const OFF = {} as NodeJS.ProcessEnv;
const ON = { RLS_ENABLED: "true" } as NodeJS.ProcessEnv;

const readGuc = (tx: Prisma.TransactionClient) =>
  tx.$queryRaw<{ v: string }[]>`SELECT current_setting(${Prisma.raw(
    `'${RLS_GUC}'`,
  )}, true) AS v`;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("runTenantTx", () => {
  it("flag OFF → düz tx (GUC set edilmez, davranış birebir)", async () => {
    const guc = await runTenantTx(
      prisma as never,
      async (tx) => (await readGuc(tx))[0]!.v,
      undefined,
      OFF,
    );
    // set_config yapılmadı → hiç dokunulmamış GUC NULL, dokunulmuşsa "" döner
    // (Postgres detayı) — ikisi de "companyId set edilmedi" demek.
    expect(guc || "").toBe("");
  });

  it("flag ON + company → tx içinde GUC set + inner model op NESTED-TX yapmaz", async () => {
    const rls = prisma.$extends(createRlsExtension());
    const result = await runWithTenantContext(
      { companyId: "c-tx", realm: "company" },
      async () =>
        runTenantTx(
          rls as never,
          async (tx) => {
            const guc = (await readGuc(tx))[0]!.v;
            // Inner model op — extension'a girer ama inTx=true → passthrough,
            // yeni $transaction denemez (nested hata YOK).
            const n = await tx.company.count();
            return { guc, n };
          },
          undefined,
          ON,
        ),
    );
    expect(result.guc).toBe("c-tx"); // GUC tx boyunca geçerli
    expect(typeof result.n).toBe("number"); // inner op nested-error olmadan koştu
  });

  it("flag ON + admin realm → düz tx (GUC set edilmez, bypass)", async () => {
    const guc = await runWithTenantContext(
      { companyId: null, realm: "admin" },
      async () =>
        runTenantTx(
          prisma as never,
          async (tx) => (await readGuc(tx))[0]!.v,
          undefined,
          ON,
        ),
    );
    expect(guc || "").toBe("");
  });

  it("inTx bayrağı tx sonrası eski haline döner (sızmaz)", async () => {
    const rls = prisma.$extends(createRlsExtension());
    await runWithTenantContext(
      { companyId: "c-x", realm: "company" },
      async () => {
        await runTenantTx(rls as never, async () => undefined, undefined, ON);
        const { getTenantStore } = await import(
          "../../src/common/tenant/tenant-context"
        );
        expect(getTenantStore()?.inTx).toBeFalsy();
      },
    );
  });
});
