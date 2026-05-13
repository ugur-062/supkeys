import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { hasPermission } from "./permissions.utils";

export const REQUIRE_PERMISSIONS_KEY = "require_permissions";

/**
 * Endpoint veya controller seviyesinde RBAC permission gerektirir.
 * Tüm verilen permission'ların kullanıcıda bulunması şart (AND mantığı).
 *
 * @example
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   @RequirePermissions("tender:create")
 *   create() { ... }
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const userId = request.user?.id as string | undefined;

    if (!userId) {
      throw new ForbiddenException("Kimlik doğrulanmadı");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        permissionsOverride: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException("Kullanıcı bulunamadı veya pasif");
    }

    const allowed = required.every((perm) =>
      hasPermission(user.role, user.permissionsOverride, perm),
    );

    if (!allowed) {
      throw new ForbiddenException("Bu işlem için gerekli yetkiniz yok");
    }

    return true;
  }
}
