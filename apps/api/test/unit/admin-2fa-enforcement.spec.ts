/**
 * Derin denetim 2026-09-29 MU-01 / X18 — admin 2FA zorunlulugu.
 *
 * ADMIN_2FA_REQUIRED_ROLES listesindeki roldeki admin 2FA'yi acmadan yalniz
 * kurulum uclarina (me + 2fa/setup + 2fa/enable) girebilir; geri kalan her
 * admin ucu 403 ADMIN_2FA_SETUP_REQUIRED. Hesap kilitlenmez (login verilir).
 */
import "reflect-metadata";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ForbiddenException, Module, type ExecutionContext } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory, Reflector } from "@nestjs/core";
import {
  ADMIN_2FA_SETUP_REQUIRED_CODE,
  assertAdmin2faConfig,
  isAdmin2faSetupRequired,
  resolveAdmin2faRequiredRoles,
} from "../../src/common/config/admin-2fa";
import { AdminAuthController } from "../../src/modules/admin-auth/admin-auth.controller";
import { ADMIN_ALLOW_WITHOUT_2FA_KEY } from "../../src/modules/admin-auth/decorators/allow-without-admin-2fa.decorator";
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

describe("resolveAdmin2faRequiredRoles", () => {
  it("tanimsiz: production'da SUPER_ADMIN, digerlerinde bos", () => {
    expect([...resolveAdmin2faRequiredRoles("production", undefined)]).toEqual(["SUPER_ADMIN"]);
    expect(resolveAdmin2faRequiredRoles("test", undefined).size).toBe(0);
    expect(resolveAdmin2faRequiredRoles("development", undefined).size).toBe(0);
    expect(resolveAdmin2faRequiredRoles(undefined, undefined).size).toBe(0);
  });

  it("bos / none: bilincli kapali (prod dahil)", () => {
    expect(resolveAdmin2faRequiredRoles("production", "").size).toBe(0);
    expect(resolveAdmin2faRequiredRoles("production", " none ").size).toBe(0);
    expect(resolveAdmin2faRequiredRoles("production", "NONE").size).toBe(0);
  });

  it("virgullu liste; bosluk ve kucuk harf normalize edilir", () => {
    expect([...resolveAdmin2faRequiredRoles("test", " super_admin , SALES,")].sort()).toEqual([
      "SALES",
      "SUPER_ADMIN",
    ]);
  });

  it("bilinmeyen rol THROW (yazim hatasi sessizce kapatmasin)", () => {
    expect(() => resolveAdmin2faRequiredRoles("production", "SUPERADMIN")).toThrow(
      /unknown admin role/,
    );
  });

  it("boot kapisi: gecersiz deger throw, prod'da kapatma uyari doner", () => {
    expect(() =>
      assertAdmin2faConfig(configOf({ NODE_ENV: "production", ADMIN_2FA_REQUIRED_ROLES: "X" })),
    ).toThrow();
    expect(
      assertAdmin2faConfig(configOf({ NODE_ENV: "production", ADMIN_2FA_REQUIRED_ROLES: "none" })),
    ).toMatch(/NOT enforced/);
    expect(assertAdmin2faConfig(configOf({ NODE_ENV: "production" }))).toBeNull();
    expect(assertAdmin2faConfig(configOf({ NODE_ENV: "test", ADMIN_2FA_REQUIRED_ROLES: "" }))).toBeNull();
  });

  it("isAdmin2faSetupRequired: yalniz zorunlu rol + 2FA kapali", () => {
    const roles = new Set(["SUPER_ADMIN"]);
    expect(isAdmin2faSetupRequired(roles, { role: "SUPER_ADMIN", twoFactorEnabled: false })).toBe(true);
    expect(isAdmin2faSetupRequired(roles, { role: "SUPER_ADMIN", twoFactorEnabled: true })).toBe(false);
    expect(isAdmin2faSetupRequired(roles, { role: "SUPPORT", twoFactorEnabled: false })).toBe(false);
  });
});

describe("AdminRolesGuard — 2FA zorunlulugu", () => {
  const reflector = new Reflector();
  const prodGuard = () =>
    new AdminRolesGuard(reflector, configOf({ NODE_ENV: "production" }) as never);
  const list = AdminCompaniesController.prototype.list; // @RequireAdminRole(SUPER_ADMIN, SALES)
  const stats = AdminCompaniesController.prototype.stats; // @AllowAnyAdminRole

  it("2FA'siz SUPER_ADMIN: rol uygun olsa da yetkili uc 403 ADMIN_2FA_SETUP_REQUIRED", () => {
    const g = prodGuard();
    for (const h of [list, stats]) {
      try {
        g.canActivate(
          ctxFor(h, AdminCompaniesController, { role: "SUPER_ADMIN", twoFactorEnabled: false }),
        );
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: ADMIN_2FA_SETUP_REQUIRED_CODE,
          i18nKey: "api.adminAuth.n2faKurulumuZorunlu",
        });
      }
    }
  });

  it("2FA'siz SUPER_ADMIN kurulum uclarina (me, 2fa/setup, 2fa/enable) girebilir", () => {
    const g = prodGuard();
    for (const m of ["me", "setup2fa", "enable2fa"] as const) {
      expect(
        g.canActivate(
          ctxFor(AdminAuthController.prototype[m], AdminAuthController, {
            role: "SUPER_ADMIN",
            twoFactorEnabled: false,
          }),
        ),
      ).toBe(true);
    }
  });

  it("2FA'siz SUPER_ADMIN sifre degistirme ve 2FA kapatma uclarina GIREMEZ", () => {
    const g = prodGuard();
    for (const m of ["changePassword", "disable2fa"] as const) {
      expect(() =>
        g.canActivate(
          ctxFor(AdminAuthController.prototype[m], AdminAuthController, {
            role: "SUPER_ADMIN",
            twoFactorEnabled: false,
          }),
        ),
      ).toThrow(ForbiddenException);
    }
  });

  it("2FA'li SUPER_ADMIN ve zorunlu olmayan rol serbest", () => {
    const g = prodGuard();
    expect(
      g.canActivate(ctxFor(list, AdminCompaniesController, { role: "SUPER_ADMIN", twoFactorEnabled: true })),
    ).toBe(true);
    expect(
      g.canActivate(ctxFor(list, AdminCompaniesController, { role: "SALES", twoFactorEnabled: false })),
    ).toBe(true);
  });

  it("zorunluluk kapaliyken (test/dev varsayilani) davranis degismez", () => {
    const g = new AdminRolesGuard(reflector, configOf({ NODE_ENV: "test" }) as never);
    expect(
      g.canActivate(ctxFor(list, AdminCompaniesController, { role: "SUPER_ADMIN", twoFactorEnabled: false })),
    ).toBe(true);
  });

  it("rol kontrolu once: yetkisiz rol yine 'yetkiniz yok' alir", () => {
    const g = new AdminRolesGuard(
      reflector,
      configOf({ NODE_ENV: "production", ADMIN_2FA_REQUIRED_ROLES: "SUPER_ADMIN,SUPPORT" }) as never,
    );
    try {
      g.canActivate(ctxFor(list, AdminCompaniesController, { role: "SUPPORT", twoFactorEnabled: false }));
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        i18nKey: "api.adminAuth.buIslemIcinYetkinizYok",
      });
    }
  });

  it("Nest DI ConfigService'i guard'a enjekte eder (process.env yedegine dusmez)", async () => {
    @Module({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ADMIN_2FA_REQUIRED_ROLES: "SUPER_ADMIN" })],
        }),
      ],
      providers: [AdminRolesGuard],
    })
    class GuardHostModule {}
    const moduleRef = await NestFactory.createApplicationContext(GuardHostModule, {
      logger: false,
    });
    const g = moduleRef.get(AdminRolesGuard);
    expect(() =>
      g.canActivate(ctxFor(list, AdminCompaniesController, { role: "SUPER_ADMIN", twoFactorEnabled: false })),
    ).toThrow(ForbiddenException);
    await moduleRef.close();
  });

  it("gecersiz ADMIN_2FA_REQUIRED_ROLES guard kurulumunda da throw (fail-closed)", () => {
    expect(
      () => new AdminRolesGuard(reflector, configOf({ ADMIN_2FA_REQUIRED_ROLES: "ROOT" }) as never),
    ).toThrow(/unknown admin role/);
  });
});

describe("@AllowWithoutAdmin2fa yalniz kurulum akisinda", () => {
  it("AdminAuthController: yalniz me + setup2fa + enable2fa isaretli", () => {
    const marked = Object.getOwnPropertyNames(AdminAuthController.prototype).filter(
      (m) =>
        m !== "constructor" &&
        Reflect.getMetadata(ADMIN_ALLOW_WITHOUT_2FA_KEY, AdminAuthController.prototype[m as never]),
    );
    expect(marked.sort()).toEqual(["enable2fa", "me", "setup2fa"]);
  });

  it("kaynak agacinda baska hicbir controller dekoratoru kullanmaz", () => {
    const root = join(__dirname, "../../src");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") && /^\s*@AllowWithoutAdmin2fa\(\)/m.test(readFileSync(p, "utf8"))) {
          hits.push(p.slice(root.length + 1));
        }
      }
    };
    walk(root);
    expect(hits).toEqual(["modules/admin-auth/admin-auth.controller.ts"]);
  });
});
