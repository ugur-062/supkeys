import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ADMIN_ANY_ROLE_KEY } from "../decorators/allow-any-admin-role.decorator";
import { ADMIN_ROLES_KEY } from "../decorators/require-admin-role.decorator";

/**
 * AdminJwtAuthGuard'dan SONRA çalışır (request.user dolu). FAIL-CLOSED: bir
 * route açıkça yetkilendirilmemişse REDDEDER (varsayılan güvenli). İki işaret:
 *  - @RequireAdminRole(...) → admin'in rolü listede değilse reddet.
 *  - @AllowAnyAdminRole()    → bilinçli olarak tüm admin rollerine açık; geçer.
 * Hiçbiri yoksa (unutulmuş/işaretlenmemiş uç) → reddet. Bu sayede yeni bir
 * sensitif uç yanlışlıkla dekoratörsüz bırakılırsa herkese açılmaz.
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ADMIN_ROLES_KEY,
      targets,
    );
    if (required && required.length > 0) {
      const req = context.switchToHttp().getRequest();
      const role = req.user?.role as string | undefined;
      if (!role || !required.includes(role)) {
        throw new ForbiddenException("Bu işlem için yetkiniz yok");
      }
      return true;
    }

    // Rol kısıtı yok — yalnız açıkça "tüm rollere açık" işaretlenmişse geçer.
    const allowAny = this.reflector.getAllAndOverride<boolean | undefined>(
      ADMIN_ANY_ROLE_KEY,
      targets,
    );
    if (allowAny) return true;

    // Fail-closed: işaretlenmemiş uç reddedilir.
    throw new ForbiddenException("Bu işlem için yetkiniz yok");
  }
}
