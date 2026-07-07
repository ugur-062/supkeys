/**
 * AdminRolesGuard — admin fonksiyon-seviyesi yetkilendirme. Yıkıcı admin
 * uçları rol bazında kısıtlanır (SUPPORT salt-okuma → yasak).
 */
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
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

function reflectorReturning(v: string[] | undefined): Reflector {
  return { getAllAndOverride: () => v } as unknown as Reflector;
}

describe("AdminRolesGuard", () => {
  it("metadata yoksa (salt-okuma ucu) serbest", () => {
    const g = new AdminRolesGuard(reflectorReturning(undefined));
    expect(g.canActivate(ctx("SUPPORT"))).toBe(true);
  });

  it("izinli rol geçer; izinsiz rol ve rolsüz istek Forbidden", () => {
    const g = new AdminRolesGuard(reflectorReturning(["SUPER_ADMIN"]));
    expect(g.canActivate(ctx("SUPER_ADMIN"))).toBe(true);
    expect(() => g.canActivate(ctx("SUPPORT"))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx("SALES"))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it("çok rollü gate: listedeki her rol geçer", () => {
    const g = new AdminRolesGuard(reflectorReturning(["SUPER_ADMIN", "SALES"]));
    expect(g.canActivate(ctx("SALES"))).toBe(true);
    expect(g.canActivate(ctx("SUPER_ADMIN"))).toBe(true);
    expect(() => g.canActivate(ctx("SUPPORT"))).toThrow(ForbiddenException);
  });
});
