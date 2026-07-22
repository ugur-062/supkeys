/**
 * CompanyPaidTierGuard — premium (PAKET) zorunlu uçların kapısı.
 * Raporlar/Şablonlar controller'larında kullanılır; STANDARD firma erişemez.
 */
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { CompanyPaidTierGuard } from "../../src/modules/company-auth/guards/company-paid-tier.guard";

function ctx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("CompanyPaidTierGuard", () => {
  const guard = new CompanyPaidTierGuard();

  it("PAKET üyelik → geçer", () => {
    expect(guard.canActivate(ctx({ tier: "GOLD" }))).toBe(true);
  });

  it("STANDARD üyelik → Forbidden (premium gerekir)", () => {
    expect(() => guard.canActivate(ctx({ tier: "STANDART" }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx({ tier: "STANDART" }))).toThrow(
      /Silver veya üzeri/i,
    );
  });

  it("kimlik yok → Forbidden", () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
