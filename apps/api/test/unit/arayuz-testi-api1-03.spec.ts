/**
 * Arayüz testi api1-03 — satınalma panosu Gold kapısı, VIES izni, kategori
 * araması alaka/kod yardımcıları (DB'siz).
 *
 *  - D-026 (T-01): `/company/dashboard/*` alım uçları GOLD (efektif kademe —
 *    süresi dolan Gold STANDART sayılır); satış uçları kademesiz kalır;
 *    aksiyon merkezinin alım tarafı handler içinde Gold ister.
 *  - D-187: `POST company-auth/vies-check` `company:manage` ister.
 *  - O-022 / O-048: alaka puanı ve kod öneki.
 */
import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { effectiveTier } from "../../src/common/company/effective-tier";
import { CompanyAuthController } from "../../src/modules/company-auth/controllers/company-auth.controller";
import { COMPANY_PERMISSION_KEY } from "../../src/modules/company-auth/decorators/require-company-permission.decorator";
import { COMPANY_TIER_KEY } from "../../src/modules/company-auth/decorators/require-tier.decorator";
import { CompanyPaidTierGuard } from "../../src/modules/company-auth/guards/company-paid-tier.guard";
import { CompanyPermissionsGuard } from "../../src/modules/company-auth/guards/company-permissions.guard";
import { CompanyDashboardController } from "../../src/modules/company-dashboard/company-dashboard.controller";
import {
  categoryCodePrefix,
  categoryMatchScore,
  relevanceWeight,
} from "../../src/modules/categories/services/category-search-rank";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = { prototype: any };
const guardsOf = (c: Ctor, m: string): unknown[] =>
  Reflect.getMetadata("__guards__", c.prototype[m]) ?? [];
const tierOf = (c: Ctor, m: string): string | undefined =>
  Reflect.getMetadata(COMPANY_TIER_KEY, c.prototype[m]);

const BUY_HANDLERS = [
  "satinalmaAnalytics",
  "timeSavingsSummary",
  "satinalma",
  "satinalmaTasarruf",
  "satinalmaTedarikci",
];
const SELL_HANDLERS = ["satisAnalytics", "satisStats", "satisAktivite"];

function handlerCtx(user: unknown, method: string): ExecutionContext {
  return {
    getHandler: () => CompanyDashboardController.prototype[method as "satinalma"],
    getClass: () => CompanyDashboardController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("D-026 — satınalma panosu uçları GOLD", () => {
  it.each(BUY_HANDLERS)("%s: @RequireTier(GOLD) + CompanyPaidTierGuard", (m) => {
    expect(tierOf(CompanyDashboardController, m)).toBe("GOLD");
    expect(guardsOf(CompanyDashboardController, m)).toContain(CompanyPaidTierGuard);
  });

  it.each(SELL_HANDLERS)("%s: satış ucu kademesiz (ücretsiz satış panosu açık)", (m) => {
    expect(tierOf(CompanyDashboardController, m)).toBeUndefined();
    expect(guardsOf(CompanyDashboardController, m)).not.toContain(CompanyPaidTierGuard);
    // Sınıf düzeyinde tier guard YOK (varsayılan SILVER eşiği satışı kapatırdı).
    expect(Reflect.getMetadata("__guards__", CompanyDashboardController)).not.toContain(
      CompanyPaidTierGuard,
    );
  });

  it("guard: STANDART / SILVER / süresi dolmuş GOLD 403, GOLD geçer", () => {
    const guard = new CompanyPaidTierGuard(new Reflector());
    const expiredGold = effectiveTier("GOLD", new Date(Date.now() - 86_400_000));
    expect(expiredGold).toBe("STANDART");
    for (const tier of ["STANDART", "SILVER", expiredGold]) {
      expect(() => guard.canActivate(handlerCtx({ tier }, "satinalma"))).toThrow(
        ForbiddenException,
      );
    }
    expect(guard.canActivate(handlerCtx({ tier: "GOLD" }, "satinalma"))).toBe(true);
  });

  describe("aksiyon merkezi — rol kapısının İÇİNDE paket kapısı", () => {
    const actionCenter = {
      satinalma: jest.fn().mockResolvedValue({ rows: [] }),
      satis: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const controller = new CompanyDashboardController(
      {} as never,
      {} as never,
      {} as never,
      actionCenter as never,
    );
    const user = (tier: string) =>
      ({
        companyId: "c1",
        tier,
        isOwner: false,
        roles: [],
        permissions: ["buy:view", "sell:view"],
      }) as never;

    beforeEach(() => jest.clearAllMocks());

    it("Silver üyede alım tarafı 403, satış tarafı açık", async () => {
      expect(() => controller.actionCenterRows(user("SILVER"), "satinalma")).toThrow(
        ForbiddenException,
      );
      expect(actionCenter.satinalma).not.toHaveBeenCalled();
      await controller.actionCenterRows(user("SILVER"), "satis");
      expect(actionCenter.satis).toHaveBeenCalledWith("c1");
    });

    it("Gold üyede alım tarafı açık", async () => {
      await controller.actionCenterRows(user("GOLD"), "satinalma");
      expect(actionCenter.satinalma).toHaveBeenCalledWith("c1");
    });
  });
});

describe("D-187 — VIES sorgusu company:manage ister", () => {
  it("izin metadata'sı ve guard bağlı", () => {
    const h = CompanyAuthController.prototype.viesCheck;
    expect(Reflect.getMetadata(COMPANY_PERMISSION_KEY, h)).toBe("company:manage");
    expect(guardsOf(CompanyAuthController, "viesCheck")).toContain(CompanyPermissionsGuard);
  });

  it("onaylayıcı (company:manage yok) 403, Kurucu geçer", () => {
    const guard = new CompanyPermissionsGuard(new Reflector());
    const ctx = (user: unknown) =>
      ({
        getHandler: () => CompanyAuthController.prototype.viesCheck,
        getClass: () => CompanyAuthController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;
    expect(() =>
      guard.canActivate(ctx({ isOwner: false, roles: [], permissions: ["approval:act"] })),
    ).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx({ isOwner: true, roles: [], permissions: [] }))).toBe(true);
  });
});

describe("O-022 — kategori alaka puanı", () => {
  const score = (nameTr: string, q: string[], extra: { nameEn?: string } = {}) =>
    categoryMatchScore({ nameTr, ...extra }, q, q.join(" "));

  it("adı kelimeyle başlayan > yalnız eş anlamlıdan gelen", () => {
    expect(score("Rulmanlar ve yataklar", ["rulman"])).toBeGreaterThan(
      score("Silikon gres", ["rulman"]),
    );
    expect(score("Silikon gres", ["rulman"])).toBe(0);
  });

  it("çekimli tam sözcük > başka sözcüğün öneki ('vana': Vanalar > Vanadyum)", () => {
    expect(score("Vanalar", ["vana"])).toBeGreaterThan(score("Vanadyum", ["vana"]));
    expect(score("Endüstriyel vanaları", ["vana"])).toBeGreaterThan(
      score("Vanadyum", ["vana"]),
    );
  });

  it("sözcük başı > sözcük içi", () => {
    expect(score("Kablolar", ["kablo"])).toBeGreaterThan(score("Fiberkablo", ["kablo"]));
    expect(score("Fiberkablo", ["kablo"])).toBeGreaterThan(0);
  });

  it("İngilizce ad da sayılır (çoğul -s)", () => {
    expect(score("Ad", ["valve"], { nameEn: "Valves" })).toBe(4);
  });
});

describe("O-048 — kod öneki", () => {
  it.each([
    ["43230000", "4323"],
    ["31161603", "31161603"],
    ["4323", "4323"],
    ["31 16 16 00", "311616"],
    ["43", "43"],
  ])("%s → %s", (q, p) => {
    expect(categoryCodePrefix(q)).toBe(p);
  });

  it("rakam dışı / tek hane / 8 haneden uzun sorguda null", () => {
    expect(categoryCodePrefix("rulman")).toBeNull();
    expect(categoryCodePrefix("6205 rulman")).toBeNull();
    expect(categoryCodePrefix("4")).toBeNull();
    expect(categoryCodePrefix("123456789")).toBeNull();
  });

  // Yeniden doğrulama (NEW-1): "2.5" noktası atılıp "25" önekiyle bütün
  // Araçlar segmentini getiriyordu. Ayırıcı yalnız ÇİFT haneli grupları böler.
  it.each(["2.5", "1.5", "12.5", "0.25", "2 5", "3116.5"])(
    "ondalık ölçü %s kod sayılmaz",
    (q) => {
      expect(categoryCodePrefix(q)).toBeNull();
    },
  );

  it.each([
    ["43.23.00.00", "4323"],
    ["4323 0000", "4323"],
    ["311", "311"],
  ])("biçimli / yazılırken kod %s → %s", (q, p) => {
    expect(categoryCodePrefix(q)).toBe(p);
  });
});

describe("O-022 (yeniden doğrulama) — sıralama ağırlığı", () => {
  it("eş anlamlı (0) ve kod eşleşmesi (≥100) ağırlık vermez", () => {
    expect(relevanceWeight(0)).toBe(0);
    expect(relevanceWeight(100)).toBe(0);
    expect(relevanceWeight(150)).toBe(0);
  });

  it("adı kelimeyle başlayan dört satır, sözcük içi elli satırı geçer", () => {
    expect(4 * relevanceWeight(4)).toBeGreaterThan(50 * relevanceWeight(1));
  });
});
