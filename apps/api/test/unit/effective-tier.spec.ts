/**
 * effectiveTier — INV-TIER-1 tek kaynak (Faz T: 4 kademe).
 * Süre-dolmuş paralı kademe (SILVER/GOLD) → STANDART (lazy).
 * Ücretsiz dönem (2026-10-07): doğrulanmış firma efektif GOLD; doğrulanmamış
 * firma saklı kademe + süre makinesiyle kalır.
 */
import {
  FREE_PERIOD,
  effectiveTier,
  effectiveTierOf,
  isFreePeriod,
  tierAtLeastWhere,
  anyPackageWhere,
} from "../../src/common/company/effective-tier";
import { tierAtLeast } from "@rothern/shared";

const past = new Date(Date.now() - 1000);
const future = new Date(Date.now() + 100_000);
const NOT_VERIFIED = ["UNVERIFIED", "PENDING", "REJECTED", null, undefined] as const;

describe("effectiveTier — ücretsiz dönem (anahtar açık)", () => {
  it("anahtar açık gelir (canlı davranış)", () => {
    expect(isFreePeriod()).toBe(true);
  });
  it("doğrulanmış firma saklı kademe/süre ne olursa olsun GOLD", () => {
    expect(effectiveTier("STANDART", null, "VERIFIED")).toBe("GOLD");
    expect(effectiveTier("SILVER", past, "VERIFIED")).toBe("GOLD");
    expect(effectiveTier("GOLD", past, "VERIFIED")).toBe("GOLD");
    expect(effectiveTier("PAKET", null, "VERIFIED")).toBe("GOLD");
    expect(
      effectiveTierOf({ tier: "STANDART", membershipEndAt: null, companyVerificationStatus: "VERIFIED" }),
    ).toBe("GOLD");
  });
  it("doğrulanmamış firma (UNVERIFIED/PENDING/REJECTED/boş) saklı kademesiyle kalır", () => {
    for (const st of NOT_VERIFIED) {
      expect(effectiveTier("STANDART", null, st)).toBe("STANDART");
      expect(effectiveTier("PAKET", null, st)).toBe("STANDART"); // fail-closed
      // Süresi dolmamış saklı paket kaybolmaz; dolmuşsa STANDART.
      expect(effectiveTier("GOLD", future, st)).toBe("GOLD");
      expect(effectiveTier("SILVER", null, st)).toBe("SILVER");
      expect(effectiveTier("GOLD", past, st)).toBe("STANDART");
      expect(effectiveTier("SILVER", past, st)).toBe("STANDART");
    }
  });
});

describe("effectiveTier — saklı kademe makinesi (anahtar kapalı)", () => {
  // Ücretli paket makinesi uykuda; anahtar kapandığı gün aynen çalışmalı.
  beforeEach(() => {
    jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("paralı kademe + geçmiş bitiş → STANDART (süre doldu)", () => {
    expect(effectiveTier("GOLD", past, "VERIFIED")).toBe("STANDART");
    expect(effectiveTier("SILVER", past, "VERIFIED")).toBe("STANDART");
    expect(effectiveTier("SILVER", past, "UNVERIFIED")).toBe("STANDART");
  });
  it("paralı kademe + gelecek/null bitiş → kendisi (aktif/süresiz)", () => {
    expect(effectiveTier("GOLD", future, "VERIFIED")).toBe("GOLD");
    expect(effectiveTier("SILVER", null, "VERIFIED")).toBe("SILVER");
    expect(effectiveTier("SILVER", future, "VERIFIED")).toBe("SILVER");
  });
  it("STANDART her durumda → STANDART; bilinmeyen değer → STANDART (fail-closed)", () => {
    expect(effectiveTier("STANDART", past, "VERIFIED")).toBe("STANDART");
    expect(effectiveTier("STANDART", null, "VERIFIED")).toBe("STANDART");
    expect(effectiveTier("PAKET", null, "VERIFIED")).toBe("STANDART"); // eski/bilinmeyen literal
  });
});

describe("tierAtLeast (shared sıra — api+web tek kaynak)", () => {
  it("kademe sırası STANDART < SILVER < GOLD (üç paket)", () => {
    expect(tierAtLeast("GOLD", "SILVER")).toBe(true);
    expect(tierAtLeast("SILVER", "SILVER")).toBe(true);
    expect(tierAtLeast("SILVER", "GOLD")).toBe(false);
    expect(tierAtLeast("SILVER", "SILVER")).toBe(true);
    expect(tierAtLeast("STANDART", "SILVER")).toBe(false);
    expect(tierAtLeast("bilinmeyen", "SILVER")).toBe(false); // fail-closed
  });
});

describe("tierAtLeastWhere / anyPackageWhere (INV-TIER-1 DB-filter tek kaynağı)", () => {
  const storedOf = (now: Date) => ({
    tier: { in: ["SILVER", "GOLD"] },
    OR: [{ membershipEndAt: null }, { membershipEndAt: { gte: now } }],
  });

  it("ücretsiz dönem: doğrulanmış firma VEYA saklı kademe+süre koşulu; tek AND'e sarılı", () => {
    const now = new Date();
    const w = tierAtLeastWhere("SILVER", now);
    expect(Object.keys(w)).toEqual(["AND"]); // sibling top-level OR ile çakışmaz
    expect(w.AND).toEqual([{ OR: [{ companyVerificationStatus: "VERIFIED" }, storedOf(now)] }]);
    // min=GOLD'da saklı dal yalnız GOLD'u sayar; doğrulanmış dal aynı kalır.
    expect(tierAtLeastWhere("GOLD", now).AND).toEqual([
      { OR: [{ companyVerificationStatus: "VERIFIED" }, { ...storedOf(now), tier: { in: ["GOLD"] } }] },
    ]);
  });
  it("anyPackageWhere = SILVER+ (dizin/keşfet/sitemap/duyuru filtresi)", () => {
    const now = new Date();
    expect(anyPackageWhere(now)).toEqual(tierAtLeastWhere("SILVER", now));
  });

  describe("anahtar kapalı — yalnız saklı kademe", () => {
    // Uykudaki ücretli paket süzgeci: anahtar kapanınca doğrulama dalı düşmeli.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("min=SILVER → tier ∈ {SILVER, GOLD} + süre koşulu AND'e sarılı", () => {
      const now = new Date();
      const w = tierAtLeastWhere("SILVER", now);
      expect(Object.keys(w)).toEqual(["AND"]);
      expect(w.AND).toEqual([storedOf(now)]);
      expect(anyPackageWhere(now).AND).toEqual([storedOf(now)]);
    });
    it("sınır effectiveTier ile birebir: gte now (< now = expired)", () => {
      // effectiveTier'da membershipEndAt < now → STANDART; dolayısıyla where'de
      // dahil olması gereken sınır gte now. (Regresyon nöbetçisi: lt/lte'ye
      // kayarsa iki taraf ıraksar.)
      const now = new Date();
      const cond = (tierAtLeastWhere("SILVER", now).AND[0] as ReturnType<typeof storedOf>).OR[1] as {
        membershipEndAt: { gte: Date };
      };
      expect(cond.membershipEndAt.gte).toBe(now);
      // Aynı sınır in-memory tarafta: tam "şimdi" biten üyelik henüz dolmamıştır.
      jest.useFakeTimers({ now });
      try {
        expect(effectiveTier("SILVER", now, "UNVERIFIED")).toBe("SILVER");
        expect(effectiveTier("SILVER", new Date(now.getTime() - 1), "UNVERIFIED")).toBe("STANDART");
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
