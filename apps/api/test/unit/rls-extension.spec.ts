/**
 * RLS Faz 1b — extension çekirdeği (runWithRls) + flag. Global client'a HENÜZ
 * bağlı değil (Faz 1c); burada mantık mock client ile izole doğrulanır.
 */
import {
  isRlsEnabled,
  runWithRls,
  RLS_GUC,
} from "../../src/common/prisma/rls-extension";
import { runWithTenantContext } from "../../src/common/tenant/tenant-context";

function mockClient() {
  const executeCalls: unknown[][] = [];
  return {
    executeCalls,
    $executeRaw: (_q: TemplateStringsArray, ...v: unknown[]) => {
      executeCalls.push(v);
      return { __setconfig: true };
    },
    $transaction: async (ops: unknown[]) => [1, `RESULT(${ops.length})`],
  };
}

const ON = { RLS_ENABLED: "true" } as NodeJS.ProcessEnv;
const OFF = {} as NodeJS.ProcessEnv;

describe("isRlsEnabled", () => {
  it("yalnız 'true' → açık", () => {
    expect(isRlsEnabled({ RLS_ENABLED: "true" } as never)).toBe(true);
    expect(isRlsEnabled({ RLS_ENABLED: "false" } as never)).toBe(false);
    expect(isRlsEnabled({} as never)).toBe(false);
  });
});

describe("runWithRls", () => {
  it("flag KAPALI → passthrough (tx YOK), bağlam olsa bile", async () => {
    const c = mockClient();
    const r = await runWithTenantContext(
      { companyId: "c1", realm: "company" },
      () => runWithRls(c as never, () => "RAN", OFF),
    );
    expect(r).toBe("RAN");
    expect(c.executeCalls).toHaveLength(0);
  });

  it("flag AÇIK + company + companyId → set_config'li tx'e sarar", async () => {
    const c = mockClient();
    const r = await runWithTenantContext(
      { companyId: "c-42", realm: "company" },
      () => runWithRls(c as never, () => "OP", ON),
    );
    // $transaction sonucu [1, RESULT(2)] → [1] index (op sonucu) döner.
    expect(r).toBe("RESULT(2)");
    // set_config GUC adı + companyId ile çağrıldı ( true SQL literali,
    // interpolasyon DEĞİL → yalnız 2 değer).
    expect(c.executeCalls).toHaveLength(1);
    expect(c.executeCalls[0]).toEqual([RLS_GUC, "c-42"]);
  });

  it("flag AÇIK + realm admin → passthrough (bypass)", async () => {
    const c = mockClient();
    const r = await runWithTenantContext(
      { companyId: null, realm: "admin" },
      () => runWithRls(c as never, () => "ADMIN", ON),
    );
    expect(r).toBe("ADMIN");
    expect(c.executeCalls).toHaveLength(0);
  });

  it("flag AÇIK + bağlam YOK → passthrough (pre-context/system)", async () => {
    const c = mockClient();
    const r = await runWithRls(c as never, () => "NOCTX", ON);
    expect(r).toBe("NOCTX");
    expect(c.executeCalls).toHaveLength(0);
  });

  it("flag AÇIK + company + companyId YOK → FIRLAT (fail-closed)", async () => {
    const c = mockClient();
    await expect(
      runWithTenantContext({ companyId: null, realm: "company" }, () =>
        runWithRls(c as never, () => "X", ON),
      ),
    ).rejects.toThrow(/tenant bağlamı|fail-closed/);
    expect(c.executeCalls).toHaveLength(0);
  });

  it("flag AÇIK + inTx (runTenantTx zaten set etti) → passthrough (nested-tx yok)", async () => {
    const c = mockClient();
    const r = await runWithTenantContext(
      { companyId: "c1", realm: "company", inTx: true },
      () => runWithRls(c as never, () => "INTX", ON),
    );
    expect(r).toBe("INTX");
    expect(c.executeCalls).toHaveLength(0);
  });
});
