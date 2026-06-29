import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedCompanyUser } from "../strategies/company-jwt.strategy";
import { COMPANY_PERMISSION_KEY } from "../decorators/require-company-permission.decorator";
import { hasCompanyPermission } from "../permissions/company-permissions.constants";

/**
 * CompanyJwtAuthGuard'dan SONRA çalışır (request.user dolu). Handler/class'taki
 * @RequireCompanyPermission metadata'sını okur ve kullanıcının (rolleri +
 * sahiplik) izne sahip olup olmadığını kontrol eder.
 */
@Injectable()
export class CompanyPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      COMPANY_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedCompanyUser | undefined;
    if (!user) throw new ForbiddenException("Yetkisiz");

    if (
      !hasCompanyPermission(
        user.roles,
        user.isOwner,
        required,
        user.permissionsOverride,
      )
    ) {
      throw new ForbiddenException("Bu işlem için yetkiniz yok");
    }
    return true;
  }
}
