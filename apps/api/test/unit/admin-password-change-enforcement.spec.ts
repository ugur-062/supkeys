/**
 * Arayuz testi D-025 — gecici parolayla (personel ekle / sifre sifirla) giris
 * yapan admin kendi sifresini koyana dek yalniz me + change-password + 2FA
 * kurulum uclarina girebilir; geri kalan her admin ucu 403
 * ADMIN_PASSWORD_CHANGE_REQUIRED.
 */
import "reflect-metadata";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminAuthController } from "../../src/modules/admin-auth/admin-auth.controller";
import { AdminStaffController } from "../../src/modules/admin-auth/admin-staff.controller";
import {
  ADMIN_ALLOW_WITHOUT_PASSWORD_CHANGE_KEY,
  ADMIN_PASSWORD_CHANGE_REQUIRED_CODE,
} from "../../src/modules/admin-auth/decorators/allow-without-admin-password-change.decorator";
import { AdminRolesGuard } from "../../src/modules/admin-auth/guards/admin-roles.guard";
import { AdminCompaniesController } from "../../src/modules/admin-companies/admin-companies.controller";

function configOf(env: Record<string, string | undefined>) {
  return { get: (key: string) => env[key] } as never;
}

function ctxFor(
  handler: (...args: never[]) => unknown,
  cls: abstract new (...args: never[]) => unknown,
  user: Record<string, unknown> | undefined,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const reflector = new Reflector();
const testGuard = () => new AdminRolesGuard(reflector, configOf({ NODE_ENV: "test" }));
const prodGuard = () => new AdminRolesGuard(reflector, configOf({ NODE_ENV: "production" }));
const list = AdminCompaniesController.prototype.list; // @RequireAdminRole(SUPER_ADMIN, SALES)
const stats = AdminCompaniesController.prototype.stats; // @AllowAnyAdminRole

describe("AdminRolesGuard — gecici parola kilidi", () => {
  it("mustChangePassword: yetkili uclar 403 ADMIN_PASSWORD_CHANGE_REQUIRED", () => {
    const g = testGuard();
    for (const h of [list, stats]) {
      try {
        g.canActivate(
          ctxFor(h, AdminCompaniesController, { role: "SUPER_ADMIN", mustChangePassword: true }),
        );
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: ADMIN_PASSWORD_CHANGE_REQUIRED_CODE,
          i18nKey: "api.adminAuth.geciciSifreDegisimiZorunlu",
        });
      }
    }
    expect(() =>
      g.canActivate(
        ctxFor(AdminStaffController.prototype.list, AdminStaffController, {
          role: "SUPER_ADMIN",
          mustChangePassword: true,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it("mustChangePassword: me + changePassword + 2FA kurulum uclari acik; disable2fa kapali", () => {
    const g = testGuard();
    const user = { role: "SUPPORT", mustChangePassword: true };
    for (const m of ["me", "changePassword", "setup2fa", "enable2fa"] as const) {
      expect(
        g.canActivate(ctxFor(AdminAuthController.prototype[m], AdminAuthController, user)),
      ).toBe(true);
    }
    expect(() =>
      g.canActivate(ctxFor(AdminAuthController.prototype.disable2fa, AdminAuthController, user)),
    ).toThrow(ForbiddenException);
  });

  it("2FA zorunlu + gecici parola: once 2FA kurulumu acik, change-password 2FA kapisinda kalir", () => {
    const g = prodGuard();
    const user = { role: "SUPER_ADMIN", twoFactorEnabled: false, mustChangePassword: true };
    for (const m of ["me", "setup2fa", "enable2fa"] as const) {
      expect(
        g.canActivate(ctxFor(AdminAuthController.prototype[m], AdminAuthController, user)),
      ).toBe(true);
    }
    expect(() =>
      g.canActivate(ctxFor(AdminAuthController.prototype.changePassword, AdminAuthController, user)),
    ).toThrow(ForbiddenException);
    // 2FA kurulunca sifre degisimi acilir (kilitlenme yok).
    expect(
      g.canActivate(
        ctxFor(AdminAuthController.prototype.changePassword, AdminAuthController, {
          ...user,
          twoFactorEnabled: true,
        }),
      ),
    ).toBe(true);
  });

  it("bayrak yok/false: davranis degismez", () => {
    const g = testGuard();
    expect(g.canActivate(ctxFor(list, AdminCompaniesController, { role: "SALES" }))).toBe(true);
    expect(
      g.canActivate(ctxFor(list, AdminCompaniesController, { role: "SALES", mustChangePassword: false })),
    ).toBe(true);
  });

  it("rol kontrolu once: yetkisiz rol yine 'yetkiniz yok' alir", () => {
    try {
      testGuard().canActivate(
        ctxFor(list, AdminCompaniesController, { role: "SUPPORT", mustChangePassword: true }),
      );
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        i18nKey: "api.adminAuth.buIslemIcinYetkinizYok",
      });
    }
  });
});

describe("@AllowWithoutAdminPasswordChange yalniz sifre/kurulum akisinda", () => {
  it("AdminAuthController: yalniz me + changePassword + setup2fa + enable2fa isaretli", () => {
    const marked = Object.getOwnPropertyNames(AdminAuthController.prototype).filter(
      (m) =>
        m !== "constructor" &&
        Reflect.getMetadata(
          ADMIN_ALLOW_WITHOUT_PASSWORD_CHANGE_KEY,
          AdminAuthController.prototype[m as never],
        ),
    );
    expect(marked.sort()).toEqual(["changePassword", "enable2fa", "me", "setup2fa"]);
  });

  it("kaynak agacinda baska hicbir controller dekoratoru kullanmaz", () => {
    const root = join(__dirname, "../../src");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (
          p.endsWith(".ts") &&
          /^\s*@AllowWithoutAdminPasswordChange\(\)/m.test(readFileSync(p, "utf8"))
        ) {
          hits.push(p.slice(root.length + 1));
        }
      }
    };
    walk(root);
    expect(hits).toEqual(["modules/admin-auth/admin-auth.controller.ts"]);
  });
});
