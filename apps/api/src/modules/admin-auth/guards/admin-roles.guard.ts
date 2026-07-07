import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ADMIN_ROLES_KEY } from "../decorators/require-admin-role.decorator";

/**
 * AdminJwtAuthGuard'dan SONRA çalışır (request.user dolu). Handler/class'taki
 * @RequireAdminRole metadata'sını okur; admin'in rolü izinli listede değilse
 * reddeder. Metadata yoksa (salt-okuma uçları) serbest bırakır.
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role = req.user?.role as string | undefined;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException("Bu işlem için yetkiniz yok");
    }
    return true;
  }
}
