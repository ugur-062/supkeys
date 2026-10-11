/**
 * Arayüz testi T3 — tek izin × paket matrisi (DB'siz sözleşmeler).
 *
 *  - Paket ÖNCE: izin eksik + paket eksik → 403 TIER_REQUIRED (web de önce
 *    paket kilidini çizer); paket yeterse izin hatası.
 *  - Talep şartları (PUT request-defaults) ve şablon izniyle kalem yazma GOLD.
 *  - Onay isteği iptali: guard bağlam ister, kural serviste (başlatan ∨
 *    approvals:manage).
 *  - Yönetim tikleri portal görüntülemesini getirir (normalizePermissions).
 *  - Talep yönetim reddi nedenine göre mesaj; yeni buy işlem izni paket kapısı.
 */
import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { normalizePermissions } from "@rothern/shared";
import { addsBuySeatPermission } from "../../src/common/company/seat-gate";
import { COMPANY_PERMISSION_KEY } from "../../src/modules/company-auth/decorators/require-company-permission.decorator";
import { COMPANY_TIER_KEY } from "../../src/modules/company-auth/decorators/require-tier.decorator";
import { CompanyPaidTierGuard } from "../../src/modules/company-auth/guards/company-paid-tier.guard";
import { CompanyPermissionsGuard } from "../../src/modules/company-auth/guards/company-permissions.guard";
import { CompanyApprovalsController } from "../../src/modules/company-approvals/company-approvals.controller";
import { CompanyDashboardController } from "../../src/modules/company-dashboard/company-dashboard.controller";
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";
import {
  LISTING_MANAGE_DENY_KEY,
  LISTING_MANAGE_PERMISSION_DENY_KEY,
  listingManageDenyKey,
} from "../../src/modules/company-listings/listing-manage-access";
import { CompanyReportsController } from "../../src/modules/company-reports/company-reports.controller";
import { CompanyRequestDefaultsController } from "../../src/modules/company-request-defaults/company-request-defaults.controller";
import { CompanyViewsController } from "../../src/modules/company-views/company-views.controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = { prototype: any };
const guardsOf = (c: Ctor, m: string): unknown[] =>
  Reflect.getMetadata("__guards__", c.prototype[m]) ?? [];
const tierOf = (c: Ctor, m: string): string | undefined =>
  Reflect.getMetadata(COMPANY_TIER_KEY, c.prototype[m]);
const permOf = (c: Ctor, m: string): unknown =>
  Reflect.getMetadata(COMPANY_PERMISSION_KEY, c.prototype[m]);

function ctx(cls: Ctor, method: string, user: unknown): ExecutionContext {
  return {
    getHandler: () => cls.prototype[method],
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const member = (tier: string, permissions: string[]) => ({
  companyId: "c1",
  userId: "u1",
  tier,
  isOwner: false,
  roles: [] as string[],
  permissions,
});

/** 403 gövdesi (ForbiddenException) — kod/mesaj. */
function forbiddenBody(fn: () => unknown): { code?: string; message?: string } {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return (e as ForbiddenException).getResponse() as { code?: string; message?: string };
  }
  throw new Error("403 beklenirdi");
}

describe("paket ÖNCE, izin SONRA (CompanyPermissionsGuard)", () => {
  const guard = new CompanyPermissionsGuard(new Reflector());

  it("satınalma panosu: STANDART + izinsiz → TIER_REQUIRED; GOLD + izinsiz → izin hatası", () => {
    const low = forbiddenBody(() =>
      guard.canActivate(ctx(CompanyDashboardController, "satinalma", member("STANDART", ["sell:view"]))),
    );
    expect(low.code).toBe("TIER_REQUIRED");
    const gold = forbiddenBody(() =>
      guard.canActivate(ctx(CompanyDashboardController, "satinalma", member("GOLD", ["sell:view"]))),
    );
    expect(gold.code).toBeUndefined();
    expect(String(gold.message)).toMatch(/yetkiniz yok/);
  });

  it("onay akışı kurma (handler GOLD) ve raporlar (sınıf GOLD) aynı sırada", () => {
    expect(
      forbiddenBody(() =>
        guard.canActivate(ctx(CompanyApprovalsController, "createFlow", member("SILVER", ["buy:view"]))),
      ).code,
    ).toBe("TIER_REQUIRED");
    expect(
      forbiddenBody(() =>
        guard.canActivate(ctx(CompanyReportsController, "general", member("STANDART", ["buy:view"]))),
      ).code,
    ).toBe("TIER_REQUIRED");
  });

  it("@RequireTier taşımayan uçta davranış değişmez (izin hatası)", () => {
    const body = forbiddenBody(() =>
      guard.canActivate(ctx(CompanyDashboardController, "satisStats", member("STANDART", ["buy:view"]))),
    );
    expect(body.code).toBeUndefined();
  });

  it("raporlar: sınıf guard sırası paket → izin", () => {
    const classGuards = Reflect.getMetadata("__guards__", CompanyReportsController) as unknown[];
    expect(classGuards.indexOf(CompanyPaidTierGuard)).toBeLessThan(
      classGuards.indexOf(CompanyPermissionsGuard),
    );
  });

  it("İş Analizi: paket kapısı guard'da (SILVER) — izinsiz STANDART üyeye de önce paket", () => {
    expect(tierOf(CompanyViewsController, "insights")).toBe("SILVER");
    expect(guardsOf(CompanyViewsController, "insights")).toContain(CompanyPaidTierGuard);
    expect(
      forbiddenBody(() =>
        guard.canActivate(ctx(CompanyViewsController, "insights", member("STANDART", ["sell:view"]))),
      ).code,
    ).toBe("TIER_REQUIRED");
    // Ziyaret Edenler kademesiz kalır (ücretsiz pakette anonim sayılar).
    expect(tierOf(CompanyViewsController, "visitors")).toBeUndefined();
  });
});

describe("Gold satınalma ayarları API'de de Gold", () => {
  it("PUT request-defaults GOLD + CompanyPaidTierGuard; GET kademesiz", () => {
    expect(tierOf(CompanyRequestDefaultsController, "save")).toBe("GOLD");
    expect(guardsOf(CompanyRequestDefaultsController, "save")).toContain(CompanyPaidTierGuard);
    expect(tierOf(CompanyRequestDefaultsController, "get")).toBeUndefined();
    const tierGuard = new CompanyPaidTierGuard(new Reflector());
    for (const tier of ["STANDART", "SILVER"]) {
      expect(() =>
        tierGuard.canActivate(ctx(CompanyRequestDefaultsController, "save", member(tier, ["buy:listing:manage"]))),
      ).toThrow(ForbiddenException);
    }
  });

  describe("kalem yazma: şablon yolu GOLD, satış yolu her pakette", () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: "i1" }),
      update: jest.fn().mockResolvedValue({ id: "i1" }),
      setActive: jest.fn().mockResolvedValue({ id: "i1" }),
    };
    const controller = new CompanyItemsController(service as never);
    beforeEach(() => jest.clearAllMocks());

    it("yalnız templates:manage + Gold altı → 403 TIER_REQUIRED, servis çağrılmaz", () => {
      const u = member("STANDART", ["buy:view", "templates:manage"]) as never;
      expect(forbiddenBody(() => controller.create(u, { name: "x", unit: "adet" } as never)).code).toBe(
        "TIER_REQUIRED",
      );
      expect(forbiddenBody(() => controller.update(u, "i1", { name: "x", unit: "adet" } as never)).code).toBe(
        "TIER_REQUIRED",
      );
      expect(forbiddenBody(() => controller.setActive(u, "i1", { isActive: true } as never)).code).toBe(
        "TIER_REQUIRED",
      );
      expect(service.create).not.toHaveBeenCalled();
      expect(service.setActive).not.toHaveBeenCalled();
    });

    it("templates:manage + GOLD geçer; sell:product:manage her pakette geçer", async () => {
      await controller.setActive(member("GOLD", ["buy:view", "templates:manage"]) as never, "i1", {
        isActive: false,
      } as never);
      await controller.create(member("STANDART", ["sell:view", "sell:product:manage"]) as never, {
        name: "x",
        unit: "adet",
      } as never);
      expect(service.setActive).toHaveBeenCalledTimes(1);
      expect(service.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe("onay isteği iptali — guard bağlam, kural serviste", () => {
  it("talebi açan (buy:listing:manage → buy:view) ve onaycı guard'dan geçer", () => {
    expect(permOf(CompanyApprovalsController, "cancel")).toEqual([
      "approvals:manage",
      "approval:act",
      "buy:view",
    ]);
    const guard = new CompanyPermissionsGuard(new Reflector());
    for (const perms of [["buy:view", "buy:listing:manage"], ["approval:act"], ["approvals:manage"]]) {
      expect(
        guard.canActivate(ctx(CompanyApprovalsController, "cancel", member("GOLD", normalizePermissions(perms)))),
      ).toBe(true);
    }
    expect(() =>
      guard.canActivate(ctx(CompanyApprovalsController, "cancel", member("GOLD", ["sell:view"]))),
    ).toThrow(ForbiddenException);
  });
});

describe("yönetim tikleri portal görüntülemesini getirir", () => {
  it("Şablonlar → satınalma görüntüleme", () => {
    expect(normalizePermissions(["templates:manage"])).toEqual(["buy:view", "templates:manage"]);
  });
  it("yalnız Bağlantılar → satış görüntüleme; bir görüntüleme varsa eklenmez", () => {
    expect(normalizePermissions(["connections:manage"])).toEqual(["sell:view", "connections:manage"]);
    expect(normalizePermissions(["buy:view", "connections:manage"])).toEqual([
      "buy:view",
      "connections:manage",
    ]);
  });
});

describe("talep yönetim reddi nedenine göre mesaj", () => {
  it("izin eksik → eksik izin metni; açan başkası → 'yalnız açan' metni", () => {
    expect(listingManageDenyKey("missing_permission")).toBe(LISTING_MANAGE_PERMISSION_DENY_KEY);
    expect(listingManageDenyKey("not_creator")).toBe(LISTING_MANAGE_DENY_KEY);
  });
});

describe("yeni buy işlem izni (uykudaki koltuk sahibine de) paket kapısına girer", () => {
  it("eklenen buy işlem izni saptanır; mevcutlar ve koltuksuzlar sayılmaz", () => {
    expect(addsBuySeatPermission(["buy:view", "buy:listing:manage"], ["buy:view", "buy:listing:manage", "buy:award"])).toBe(true);
    expect(addsBuySeatPermission(["buy:view", "buy:listing:manage"], ["buy:view", "buy:listing:manage", "sell:view"])).toBe(false);
    expect(addsBuySeatPermission(["sell:view"], ["sell:view", "buy:view", "buy:reports:view"])).toBe(false);
  });
});
