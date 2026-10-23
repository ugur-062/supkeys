import { describe, expect, it } from "vitest";
import { FREE_PERIOD_VERIFIED_HAS_FULL_ACCESS, hasFullAccess } from "../entitlement";

const NOW = new Date("2026-10-07T12:00:00+03:00").getTime();
const PAST = "2026-10-01T00:00:00.000Z";
const FUTURE = "2027-10-01T00:00:00.000Z";

/**
 * Ücretsiz dönem (sahip kararı 2026-10-07): doğrulanmış her firma tam yetkili;
 * doğrulanmamış firma temel sınırlarda; önceden tanımlı yetki korunur.
 */
describe("hasFullAccess — ücretsiz dönem aynası", () => {
  it("anahtar açık", () => {
    expect(FREE_PERIOD_VERIFIED_HAS_FULL_ACCESS).toBe(true);
  });

  it("doğrulanmış firma ham kademesi ne olursa olsun tam yetkili", () => {
    for (const tier of ["STANDART", "SILVER", "GOLD"]) {
      expect(
        hasFullAccess({ tier, membershipEndAt: PAST, companyVerificationStatus: "VERIFIED" }, NOW),
      ).toBe(true);
    }
  });

  it.each(["UNVERIFIED", "PENDING", "REJECTED"])(
    "doğrulanmamış (%s) firma temel kademede tam yetkili değil",
    (status) => {
      expect(
        hasFullAccess({ tier: "STANDART", membershipEndAt: null, companyVerificationStatus: status }, NOW),
      ).toBe(false);
      expect(
        hasFullAccess({ tier: "SILVER", membershipEndAt: FUTURE, companyVerificationStatus: status }, NOW),
      ).toBe(false);
    },
  );

  it("önceden tanımlanmış, süresi geçmemiş tam yetki doğrulama olmadan da korunur; süresi geçmişse korunmaz", () => {
    expect(
      hasFullAccess({ tier: "GOLD", membershipEndAt: FUTURE, companyVerificationStatus: "PENDING" }, NOW),
    ).toBe(true);
    expect(
      hasFullAccess({ tier: "GOLD", membershipEndAt: null, companyVerificationStatus: "UNVERIFIED" }, NOW),
    ).toBe(true);
    expect(
      hasFullAccess({ tier: "GOLD", membershipEndAt: PAST, companyVerificationStatus: "UNVERIFIED" }, NOW),
    ).toBe(false);
  });

  it("API efektif değeri verirse otorite odur (ham alan ve yerel kural okunmaz)", () => {
    expect(
      hasFullAccess(
        { tier: "STANDART", effectiveTier: "STANDART", companyVerificationStatus: "VERIFIED" },
        NOW,
      ),
    ).toBe(false);
    expect(
      hasFullAccess(
        { tier: "STANDART", effectiveTier: "GOLD", companyVerificationStatus: "UNVERIFIED" },
        NOW,
      ),
    ).toBe(true);
    expect(
      hasFullAccess(
        { tier: "GOLD", effectiveTier: "STANDART", membershipEndAt: FUTURE, companyVerificationStatus: "REJECTED" },
        NOW,
      ),
    ).toBe(false);
  });
});
