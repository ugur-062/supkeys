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
import { ADMIN_ANY_ROLE_KEY } from "../../src/modules/admin-auth/decorators/allow-any-admin-role.decorator";
import { ADMIN_ROLES_KEY } from "../../src/modules/admin-auth/decorators/require-admin-role.decorator";
import { AdminCompaniesController } from "../../src/modules/admin-companies/admin-companies.controller";
import { AdminCompanyUsersController } from "../../src/modules/admin-companies/admin-company-users.controller";
import { AdminInspectionController } from "../../src/modules/admin-companies/admin-inspection.controller";
import { AdminEmailLogsController } from "../../src/modules/email/admin-email-logs.controller";
import { AdminSystemController } from "../../src/modules/admin-system/admin-system.controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = { prototype: any };
const roles = (c: Ctor, m: string): string[] | undefined =>
  Reflect.getMetadata(ADMIN_ROLES_KEY, c.prototype[m]);
const anyRole = (c: Ctor, m: string): boolean | undefined =>
  Reflect.getMetadata(ADMIN_ANY_ROLE_KEY, c.prototype[m]);

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
});
