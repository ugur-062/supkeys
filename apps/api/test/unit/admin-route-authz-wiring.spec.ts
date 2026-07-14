/**
 * Fail-closed admin authz — WIRING testi. AdminRolesGuard artık işaretsiz uçları
 * reddediyor (admin-roles.guard.spec.ts davranışı kanıtlıyor). Bu dosya her
 * sensitif route'un DOĞRU işareti taşıdığını (metadata seviyesinde) doğrular:
 *  - #4 GET /admin/companies → @RequireAdminRole(SUPER_ADMIN,SALES), any-role YOK
 *  - #7 notes oku/yaz → gated; delete zaten SUPER_ADMIN
 *  - PII sınıfı (email-logs, suppressions, search) → gated
 *  - bilinçli-açık okuma uçları → @AllowAnyAdminRole (SUPPORT erişimi korunur)
 */
import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ADMIN_ANY_ROLE_KEY } from "../../src/modules/admin-auth/decorators/allow-any-admin-role.decorator";
import { ADMIN_ROLES_KEY } from "../../src/modules/admin-auth/decorators/require-admin-role.decorator";
import { AdminAuthController } from "../../src/modules/admin-auth/admin-auth.controller";
import { AdminJwtAuthGuard } from "../../src/modules/admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../../src/modules/admin-auth/guards/admin-roles.guard";
import { AdminCompaniesController } from "../../src/modules/admin-companies/admin-companies.controller";
import { AdminCompanyUsersController } from "../../src/modules/admin-companies/admin-company-users.controller";
import { AdminInspectionController } from "../../src/modules/admin-companies/admin-inspection.controller";
import { AdminEmailLogsController } from "../../src/modules/email/admin-email-logs.controller";
import { AdminSystemController } from "../../src/modules/admin-system/admin-system.controller";
import { HealthController } from "../../src/modules/health/health.controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = { prototype: any };
const roles = (c: Ctor, m: string): string[] | undefined =>
  Reflect.getMetadata(ADMIN_ROLES_KEY, c.prototype[m]);
const anyRole = (c: Ctor, m: string): boolean | undefined =>
  Reflect.getMetadata(ADMIN_ANY_ROLE_KEY, c.prototype[m]);

// @UseGuards(...) metadata'sı NestJS GUARDS_METADATA ("__guards__") altında
// handler'a yazılır; değer guard sınıfları dizisidir.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guardsOf = (c: Ctor, m: string): any[] =>
  Reflect.getMetadata("__guards__", c.prototype[m]) ?? [];
const hasGuard = (c: Ctor, m: string, G: { name: string }): boolean =>
  guardsOf(c, m).some((g) => g === G || g?.name === G.name);

const KYC = ["SUPER_ADMIN", "SALES"];

describe("admin route authz wiring (fail-closed)", () => {
  describe("#4 companies list — detail ile simetrik", () => {
    it("list gated (SUPER_ADMIN,SALES), any-role YOK", () => {
      expect(roles(AdminCompaniesController, "list")).toEqual(KYC);
      expect(anyRole(AdminCompaniesController, "list")).toBeFalsy();
    });
    it("detail hâlâ gated (regresyon)", () => {
      expect(roles(AdminCompaniesController, "detail")).toEqual(KYC);
    });
    it("stats/complaints bilinçli açık (any-role)", () => {
      expect(anyRole(AdminCompaniesController, "stats")).toBe(true);
      expect(anyRole(AdminCompaniesController, "complaints")).toBe(true);
    });
  });

  describe("#7 dahili notlar — asimetri kapandı", () => {
    it("listNotes + addNote gated", () => {
      expect(roles(AdminCompaniesController, "listNotes")).toEqual(KYC);
      expect(roles(AdminCompaniesController, "addNote")).toEqual(KYC);
    });
    it("deleteNote SUPER_ADMIN (regresyon)", () => {
      expect(roles(AdminCompaniesController, "deleteNote")).toEqual([
        "SUPER_ADMIN",
      ]);
    });
  });

  describe("PII sınıfı gated", () => {
    it("global search", () => {
      expect(roles(AdminCompaniesController, "search")).toEqual(KYC);
    });
    it("email-logs list + detail", () => {
      expect(roles(AdminEmailLogsController, "list")).toEqual(KYC);
      expect(roles(AdminEmailLogsController, "findOne")).toEqual(KYC);
    });
    it("system suppressions gated, status açık", () => {
      expect(roles(AdminSystemController, "listSuppressions")).toEqual(KYC);
      expect(anyRole(AdminSystemController, "status")).toBe(true);
    });
  });

  describe("bilinçli-açık okuma uçları — SUPPORT erişimi korunur", () => {
    it("inspection 5 okuma any-role", () => {
      for (const m of [
        "listListings",
        "listingDetail",
        "listOrders",
        "orderDetail",
        "listConnections",
      ]) {
        expect(anyRole(AdminInspectionController, m)).toBe(true);
      }
    });
    it("inspection müdahaleleri gated (regresyon)", () => {
      expect(roles(AdminInspectionController, "closeListing")).toEqual(KYC);
      expect(anyRole(AdminInspectionController, "closeListing")).toBeFalsy();
    });
    it("company-users okuma + zararsız kurtarma any-role, yazma gated", () => {
      for (const m of [
        "list",
        "sendPasswordReset",
        "resendVerification",
        "dropSessions",
      ]) {
        expect(anyRole(AdminCompanyUsersController, m)).toBe(true);
      }
      expect(roles(AdminCompanyUsersController, "setActive")).toEqual(KYC);
      expect(roles(AdminCompanyUsersController, "addUser")).toEqual(KYC);
    });
  });

  // Latent guard-chain tuzağı: admin-auth + health, RolesGuard zincirinde
  // DEĞİLDİ → buraya konacak @RequireAdminRole sessizce no-op olurdu (#12
  // fail-open sınıfının yeniden doğması). Authed uçlar artık zincirde;
  // pre-auth/public uçlar bilinçli guard'sız.
  describe("guard-chain tuzağı kapatıldı (admin-auth + health)", () => {
    const AUTHED_ADMIN_AUTH = [
      "me",
      "changePassword",
      "setup2fa",
      "enable2fa",
      "disable2fa",
    ];

    it("admin-auth authed uçları: JWT + RolesGuard zincirde + any-role işaretli", () => {
      for (const m of AUTHED_ADMIN_AUTH) {
        expect(hasGuard(AdminAuthController, m, AdminJwtAuthGuard)).toBe(true);
        expect(hasGuard(AdminAuthController, m, AdminRolesGuard)).toBe(true);
        expect(anyRole(AdminAuthController, m)).toBe(true);
      }
    });

    it("health/storage: JWT + RolesGuard zincirde + any-role işaretli", () => {
      expect(hasGuard(HealthController, "storageHealth", AdminJwtAuthGuard)).toBe(
        true,
      );
      expect(hasGuard(HealthController, "storageHealth", AdminRolesGuard)).toBe(
        true,
      );
      expect(anyRole(HealthController, "storageHealth")).toBe(true);
    });

    it("pre-auth/public uçlar guard'sız kaldı (davranış değişmedi)", () => {
      for (const m of ["login", "logout"]) {
        expect(hasGuard(AdminAuthController, m, AdminJwtAuthGuard)).toBe(false);
        expect(hasGuard(AdminAuthController, m, AdminRolesGuard)).toBe(false);
        expect(anyRole(AdminAuthController, m)).toBeFalsy();
      }
      // GET /health uptime ucu tamamen public.
      expect(hasGuard(HealthController, "check", AdminJwtAuthGuard)).toBe(false);
      expect(hasGuard(HealthController, "check", AdminRolesGuard)).toBe(false);
    });

    it("EŞLEŞTIRME INVARIANT'I: JWT taşıyan her handler RolesGuard da taşımalı — gelecekte biri unutursa bu test kırılır", () => {
      for (const C of [AdminAuthController, HealthController]) {
        for (const m of Object.getOwnPropertyNames(C.prototype)) {
          if (m === "constructor") continue;
          if (hasGuard(C, m, AdminJwtAuthGuard)) {
            expect(hasGuard(C, m, AdminRolesGuard)).toBe(true);
          }
        }
      }
    });
  });
});

/**
 * "Dekoratörsüz sensitif uç eklenirse reddedilir" — zincire bağlandıktan sonra
 * RolesGuard fail-closed davranır: rol/any-role işareti OLMAYAN bir handler
 * (ör. gelecekte eklenip işaretlenmesi unutulan sensitif uç) REDDEDİLİR.
 * (Guard'ın kendisi admin-roles.guard.spec.ts'te de kanıtlı; burası bağlamsal.)
 */
describe("bağlı zincirde işaretsiz sensitif uç reddedilir", () => {
  it("RolesGuard: işaret yok → Forbidden", () => {
    const reflector = {
      getAllAndOverride: () => undefined, // ne @RequireAdminRole ne @AllowAnyAdminRole
    } as unknown as Reflector;
    const guard = new AdminRolesGuard(reflector);
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: "SUPER_ADMIN" } }),
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
