/**
 * AdminRolesGuard — admin fonksiyon-seviyesi yetkilendirme. FAIL-CLOSED:
 * açıkça işaretlenmemiş uç reddedilir. İki işaret: @RequireAdminRole(...) rol
 * kısıtı, @AllowAnyAdminRole() ise tüm rollere açık (SUPPORT dahil).
 */
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { ADMIN_ANY_ROLE_KEY } from "../../src/modules/admin-auth/decorators/allow-any-admin-role.decorator";
import { ADMIN_ROLES_KEY } from "../../src/modules/admin-auth/decorators/require-admin-role.decorator";
import { AdminRolesGuard } from "../../src/modules/admin-auth/guards/admin-roles.guard";

function ctx(role?: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

/**
 * Anahtar bazlı metadata döndüren reflector. roles → ADMIN_ROLES_KEY,
 * anyRole → ADMIN_ANY_ROLE_KEY.
 */
function reflectorFor(opts: {
  roles?: string[];
  anyRole?: boolean;
}): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === ADMIN_ROLES_KEY) return opts.roles;
      if (key === ADMIN_ANY_ROLE_KEY) return opts.anyRole;
      return undefined;
    },
  } as unknown as Reflector;
}

describe("AdminRolesGuard (fail-closed)", () => {
  it("hiçbir işaret yoksa (unutulmuş uç) REDDEDER — SUPER_ADMIN dahil", () => {
    const g = new AdminRolesGuard(reflectorFor({}));
    expect(() => g.canActivate(ctx("SUPPORT"))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx("SALES"))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx("SUPER_ADMIN"))).toThrow(ForbiddenException);
  });

  it("@AllowAnyAdminRole → tüm roller (SUPPORT dahil) geçer", () => {
    const g = new AdminRolesGuard(reflectorFor({ anyRole: true }));
    expect(g.canActivate(ctx("SUPPORT"))).toBe(true);
    expect(g.canActivate(ctx("SALES"))).toBe(true);
    expect(g.canActivate(ctx("SUPER_ADMIN"))).toBe(true);
  });

  it("izinli rol geçer; izinsiz rol ve rolsüz istek Forbidden", () => {
    const g = new AdminRolesGuard(reflectorFor({ roles: ["SUPER_ADMIN"] }));
    expect(g.canActivate(ctx("SUPER_ADMIN"))).toBe(true);
    expect(() => g.canActivate(ctx("SUPPORT"))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx("SALES"))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it("çok rollü gate: listedeki her rol geçer, dışındaki reddedilir", () => {
    const g = new AdminRolesGuard(
      reflectorFor({ roles: ["SUPER_ADMIN", "SALES"] }),
    );
    expect(g.canActivate(ctx("SALES"))).toBe(true);
    expect(g.canActivate(ctx("SUPER_ADMIN"))).toBe(true);
    expect(() => g.canActivate(ctx("SUPPORT"))).toThrow(ForbiddenException);
  });

  it("boş rol dizisi de işaretsiz sayılır → reddeder", () => {
    const g = new AdminRolesGuard(reflectorFor({ roles: [] }));
    expect(() => g.canActivate(ctx("SUPER_ADMIN"))).toThrow(ForbiddenException);
  });
});
