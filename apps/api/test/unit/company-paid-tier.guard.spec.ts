/**
 * CompanyPaidTierGuard — paket zorunlu uçların kapısı (üç paket 2026-09-06):
 * varsayılan eşik SILVER; `@RequireTier("GOLD")` metadata'sı satınalma paneli
 * özelliklerini (raporlar/şablonlar/onay akışı/talep AI'ı) GOLD'a bağlar.
 */
import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CompanyPaidTierGuard } from "../../src/modules/company-auth/guards/company-paid-tier.guard";
import { COMPANY_TIER_KEY } from "../../src/modules/company-auth/decorators/require-tier.decorator";

function ctx(user: unknown, minTier?: "SILVER" | "GOLD"): ExecutionContext {
  const handler = () => undefined;
  if (minTier) Reflect.defineMetadata(COMPANY_TIER_KEY, minTier, handler);
  class Cls {}
  return {
    getHandler: () => handler,
    getClass: () => Cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("CompanyPaidTierGuard", () => {
  const guard = new CompanyPaidTierGuard(new Reflector());

  it("varsayılan eşik SILVER: Silver ve Gold geçer, Standart 403", () => {
    expect(guard.canActivate(ctx({ tier: "SILVER" }))).toBe(true);
    expect(guard.canActivate(ctx({ tier: "GOLD" }))).toBe(true);
    expect(() => guard.canActivate(ctx({ tier: "STANDART" }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx({ tier: "STANDART" }))).toThrow(
      /Silver veya üzeri/i,
    );
  });

  it("@RequireTier(GOLD): Silver 403 (satınalma paneli), Gold geçer", () => {
    expect(() => guard.canActivate(ctx({ tier: "SILVER" }, "GOLD"))).toThrow(
      /Gold paket/,
    );
    expect(guard.canActivate(ctx({ tier: "GOLD" }, "GOLD"))).toBe(true);
  });

  it("kimlik yok → Forbidden", () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
