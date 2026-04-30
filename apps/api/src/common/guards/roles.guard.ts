import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_METADATA_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<string[]>(
      ROLES_METADATA_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (!allowed || allowed.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user as { role?: string } | undefined;

    if (!user || !user.role) {
      throw new ForbiddenException("Yetkisiz");
    }

    if (!allowed.includes(user.role)) {
      throw new ForbiddenException("Bu işlem için yetkiniz yok");
    }

    return true;
  }
}
