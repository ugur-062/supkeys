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

  it("paket reddi TIER_REQUIRED kodu + minTier taşır (web kilit kartı toast basmasın — arayüz testi O-044)", () => {
    const body = (min: "SILVER" | "GOLD") => {
      try {
        guard.canActivate(ctx({ tier: "STANDART" }, min));
      } catch (e) {
        return (e as ForbiddenException).getResponse() as Record<string, unknown>;
      }
      throw new Error("beklenen 403 gelmedi");
    };
    expect(body("SILVER")).toMatchObject({ code: "TIER_REQUIRED", minTier: "SILVER", statusCode: 403 });
    expect(body("GOLD")).toMatchObject({ code: "TIER_REQUIRED", minTier: "GOLD", statusCode: 403 });
    expect(String(body("SILVER").message)).toMatch(/Silver veya üzeri/i);
  });

  it("kimlik yok → Forbidden", () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});

/**
 * Derin denetim Y-05: ortak AI yükleme presign'ı (`POST company/ai/uploads/url`)
 * GOLD sınıflı TenderExtractController içinde yaşıyor ama Silver+ satış AI'ı
 * ("Belgeden Fiyatla", bid-price-extract) dosyalarını ondan alır. Gerçek
 * controller metadata'sıyla: uploads/url SILVER'a açık, talep AI'ı GOLD kalır.
 */
describe("CompanyPaidTierGuard — AI uçları gerçek metadata", () => {
  const guard = new CompanyPaidTierGuard(new Reflector());
  function route(cls: abstract new (...args: never[]) => unknown, method: string, tier: string) {
    const handler = (cls.prototype as Record<string, unknown>)[method];
    expect(typeof handler).toBe("function");
    return {
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ user: { tier } }) }),
    } as unknown as ExecutionContext;
  }

  it("uploads/url: Silver geçer (Belgeden Fiyatla), Standart 403", async () => {
    const { TenderExtractController } = await import(
      "../../src/modules/ai/tender-extract/tender-extract.controller"
    );
    expect(guard.canActivate(route(TenderExtractController, "uploadUrl", "SILVER"))).toBe(true);
    expect(() =>
      guard.canActivate(route(TenderExtractController, "uploadUrl", "STANDART")),
    ).toThrow(ForbiddenException);
  });

  it("talep AI'ı (tender-extract/refine/öneriler) GOLD kalır", async () => {
    const { TenderExtractController } = await import(
      "../../src/modules/ai/tender-extract/tender-extract.controller"
    );
    for (const m of ["extract", "refine", "categorySuggestForItems", "titleSuggestForItems"]) {
      expect(() => guard.canActivate(route(TenderExtractController, m, "SILVER"))).toThrow(
        /Gold paket/,
      );
      expect(guard.canActivate(route(TenderExtractController, m, "GOLD"))).toBe(true);
    }
  });

  it("bid-price-extract Silver'a açık (aynı presign anahtarlarını tüketir)", async () => {
    const { BidPriceExtractController } = await import(
      "../../src/modules/ai/bid-price-extract/bid-price-extract.controller"
    );
    expect(guard.canActivate(route(BidPriceExtractController, "extract", "SILVER"))).toBe(true);
  });
});
