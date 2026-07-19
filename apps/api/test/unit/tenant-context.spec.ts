/**
 * RLS Faz 1a — tenant bağlamı ALS + interceptor. Bugün sorgu davranışını
 * değiştirmez; yalnız companyId'yi async context'e taşır (ileride Prisma
 * extension buradan okuyacak). Testler: run/get/set + await-güvenliği + bağlam
 * yokken no-op + interceptor req.user'dan doğru yazma.
 */
import { of, lastValueFrom } from "rxjs";
import {
  getCurrentCompanyId,
  getTenantStore,
  runWithTenantContext,
  setTenantContext,
} from "../../src/common/tenant/tenant-context";
import { TenantContextInterceptor } from "../../src/common/tenant/tenant-context.interceptor";

describe("tenant-context ALS", () => {
  it("bağlam YOKken getCurrentCompanyId → null, setTenantContext → no-op (throw yok)", () => {
    expect(getCurrentCompanyId()).toBeNull();
    expect(getTenantStore()).toBeUndefined();
    expect(() => setTenantContext("c1")).not.toThrow();
    expect(getCurrentCompanyId()).toBeNull(); // hâlâ null (yazılacak store yok)
  });

  it("run içinde set → get; başta null", () => {
    runWithTenantContext({ companyId: null, realm: null }, () => {
      expect(getCurrentCompanyId()).toBeNull();
      setTenantContext("c1", "company");
      expect(getCurrentCompanyId()).toBe("c1");
      expect(getTenantStore()).toEqual({ companyId: "c1", realm: "company" });
    });
    // run dışında tekrar null
    expect(getCurrentCompanyId()).toBeNull();
  });

  it("await boundary'si boyunca bağlam korunur (mutasyon referansla görünür)", async () => {
    await runWithTenantContext({ companyId: null, realm: null }, async () => {
      setTenantContext("c-async");
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      expect(getCurrentCompanyId()).toBe("c-async");
    });
  });

  it("iç içe run'lar birbirini izole eder", () => {
    runWithTenantContext({ companyId: "outer", realm: "company" }, () => {
      expect(getCurrentCompanyId()).toBe("outer");
      runWithTenantContext({ companyId: "inner", realm: "company" }, () => {
        expect(getCurrentCompanyId()).toBe("inner");
      });
      expect(getCurrentCompanyId()).toBe("outer");
    });
  });
});

describe("TenantContextInterceptor", () => {
  const ctx = (user: unknown) =>
    ({
      getType: () => "http",
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;
  const nextH = { handle: () => of("ok") } as never;

  it("req.user.companyId → bağlama company realm ile yazar", async () => {
    const it = new TenantContextInterceptor();
    await runWithTenantContext({ companyId: null, realm: null }, async () => {
      await lastValueFrom(it.intercept(ctx({ companyId: "c9" }), nextH));
      expect(getTenantStore()).toEqual({ companyId: "c9", realm: "company" });
    });
  });

  it("companyId'siz kimlik (admin) → realm admin, companyId null (bypass sinyali)", async () => {
    const it = new TenantContextInterceptor();
    await runWithTenantContext({ companyId: null, realm: null }, async () => {
      await lastValueFrom(it.intercept(ctx({ adminId: "a1" }), nextH));
      expect(getTenantStore()).toEqual({ companyId: null, realm: "admin" });
    });
  });

  it("auth'suz istek (user yok) → bağlam null kalır (pre-context)", async () => {
    const it = new TenantContextInterceptor();
    await runWithTenantContext({ companyId: null, realm: null }, async () => {
      await lastValueFrom(it.intercept(ctx(undefined), nextH));
      expect(getTenantStore()).toEqual({ companyId: null, realm: null });
    });
  });
});
