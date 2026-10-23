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

// `user.tier` JWT strategy'nin hesapladığı EFEKTİF kademedir: ücretsiz dönemde
// doğrulanmış firma GOLD taşır; kapıya takılan yalnız doğrulanmamış firmadır.
const UNV = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" };
const VERIFY_TR = /firmanızın doğrulanması gerekir/i;
const PACKAGE_WORD = /paket|silver|gold|premium|üyelik/i;

describe("CompanyPaidTierGuard", () => {
  const guard = new CompanyPaidTierGuard(new Reflector());

  it("varsayılan eşik SILVER: doğrulanmış (efektif Gold) ve saklı Silver geçer, doğrulanmamış Standart 403", () => {
    expect(guard.canActivate(ctx({ tier: "GOLD", companyVerificationStatus: "VERIFIED" }))).toBe(true);
    expect(guard.canActivate(ctx({ tier: "SILVER", companyVerificationStatus: "UNVERIFIED" }))).toBe(true);
    expect(() => guard.canActivate(ctx(UNV))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(UNV))).toThrow(VERIFY_TR);
  });

  it("@RequireTier(GOLD): doğrulanmamış saklı Silver 403 (satınalma paneli), doğrulanmış geçer", () => {
    const silver = { tier: "SILVER", companyVerificationStatus: "UNVERIFIED" };
    expect(() => guard.canActivate(ctx(silver, "GOLD"))).toThrow(VERIFY_TR);
    expect(() => guard.canActivate(ctx(silver, "GOLD"))).not.toThrow(PACKAGE_WORD);
    expect(guard.canActivate(ctx({ tier: "GOLD", companyVerificationStatus: "VERIFIED" }, "GOLD"))).toBe(true);
  });

  const body = (user: Record<string, unknown>, min: "SILVER" | "GOLD") => {
    try {
      guard.canActivate(ctx(user, min));
    } catch (e) {
      return (e as ForbiddenException).getResponse() as Record<string, unknown>;
    }
    throw new Error("beklenen 403 gelmedi");
  };

  it("kademe reddi TIER_REQUIRED kodu + minTier taşır (web kilit kartı toast basmasın — arayüz testi O-044)", () => {
    expect(body(UNV, "SILVER")).toMatchObject({ code: "TIER_REQUIRED", minTier: "SILVER", statusCode: 403 });
    expect(body(UNV, "GOLD")).toMatchObject({ code: "TIER_REQUIRED", minTier: "GOLD", statusCode: 403 });
    // Ücretsiz dönem: metin doğrulama ister, paket anmaz; web doğrulama akışına bağlar.
    expect(String(body(UNV, "SILVER").message)).toMatch(VERIFY_TR);
    expect(body(UNV, "SILVER")).toMatchObject({
      verificationStatus: "UNVERIFIED",
      verifyPath: "/company/ayarlar/dogrulama",
    });
  });

  it("ret metni doğrulama durumuna göre ayrışır ve hiçbirinde paket sözcüğü geçmez", () => {
    const msg = (status: string) =>
      String(body({ tier: "STANDART", companyVerificationStatus: status }, "GOLD").message);
    expect(msg("PENDING")).toMatch(/inceleniyor/i);
    expect(msg("REJECTED")).toMatch(/yeniden/i);
    expect(new Set([msg("UNVERIFIED"), msg("PENDING"), msg("REJECTED")]).size).toBe(3);
    for (const s of ["UNVERIFIED", "PENDING", "REJECTED"]) {
      expect(msg(s)).not.toMatch(PACKAGE_WORD);
      expect(body({ tier: "STANDART", companyVerificationStatus: s }, "GOLD").verificationStatus).toBe(s);
    }
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
      // Doğrulanmamış firma saklı kademesiyle kalır (kapı eşiği ayrımı burada ölçülür).
      switchToHttp: () => ({
        getRequest: () => ({ user: { tier, companyVerificationStatus: "UNVERIFIED" } }),
      }),
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
        VERIFY_TR,
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
