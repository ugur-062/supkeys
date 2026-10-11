import { i18nMessage } from "../../../common/i18n/http-i18n";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import {
  ADMIN_2FA_SETUP_REQUIRED_CODE,
  admin2faRequiredRolesFromConfig,
  isAdmin2faSetupRequired,
} from "../../../common/config/admin-2fa";
import { ADMIN_ANY_ROLE_KEY } from "../decorators/allow-any-admin-role.decorator";
import { ADMIN_ALLOW_WITHOUT_2FA_KEY } from "../decorators/allow-without-admin-2fa.decorator";
import {
  ADMIN_ALLOW_WITHOUT_PASSWORD_CHANGE_KEY,
  ADMIN_PASSWORD_CHANGE_REQUIRED_CODE,
} from "../decorators/allow-without-admin-password-change.decorator";
import { ADMIN_ROLES_KEY } from "../decorators/require-admin-role.decorator";

/**
 * AdminJwtAuthGuard'dan SONRA çalışır (request.user dolu). FAIL-CLOSED: bir
 * route açıkça yetkilendirilmemişse REDDEDER (varsayılan güvenli). İki işaret:
 *  - @RequireAdminRole(...) → admin'in rolü listede değilse reddet.
 *  - @AllowAnyAdminRole()    → bilinçli olarak tüm admin rollerine açık; geçer.
 * Hiçbiri yoksa (unutulmuş/işaretlenmemiş uç) → reddet. Bu sayede yeni bir
 * sensitif uç yanlışlıkla dekoratörsüz bırakılırsa herkese açılmaz.
 *
 * 2FA zorunluluğu (derin denetim MU-01): rolü ADMIN_2FA_REQUIRED_ROLES'ta olup
 * 2FA'yı açmamış admin, rol kontrolünü geçse bile yalnız
 * @AllowWithoutAdmin2fa() işaretli kurulum uçlarına girebilir; diğerleri 403
 * `ADMIN_2FA_SETUP_REQUIRED`. `twoFactorEnabled` AdminJwtStrategy'nin her
 * istekte DB'den okuduğu değerdir (eski JWT'ler de kapsanır).
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  private readonly twoFactorRequiredRoles: ReadonlySet<string>;

  constructor(
    private readonly reflector: Reflector,
    config?: ConfigService,
  ) {
    // Geçersiz değer burada da THROW eder → uygulama ayağa kalkmaz (fail-closed).
    this.twoFactorRequiredRoles = admin2faRequiredRolesFromConfig(config);
  }

  canActivate(context: ExecutionContext): boolean {
    this.assertRoleAuthorized(context);
    this.assertTwoFactorEnrolled(context);
    this.assertPasswordChanged(context);
    return true;
  }

  private assertPasswordChanged(context: ExecutionContext): void {
    const user = context.switchToHttp().getRequest().user as
      | { mustChangePassword?: boolean }
      | undefined;
    if (user?.mustChangePassword !== true) return;
    const exempt = this.reflector.getAllAndOverride<boolean | undefined>(
      ADMIN_ALLOW_WITHOUT_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (exempt) return;
    throw new ForbiddenException(
      i18nMessage(
        "api.adminAuth.geciciSifreDegisimiZorunlu",
        undefined,
        ADMIN_PASSWORD_CHANGE_REQUIRED_CODE,
      ),
    );
  }

  private assertTwoFactorEnrolled(context: ExecutionContext): void {
    if (this.twoFactorRequiredRoles.size === 0) return;
    const user = context.switchToHttp().getRequest().user as
      | { role?: string; twoFactorEnabled?: boolean }
      | undefined;
    if (!user?.role) return; // rol kontrolü zaten reddetti/geçti
    if (
      !isAdmin2faSetupRequired(this.twoFactorRequiredRoles, {
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      })
    ) {
      return;
    }
    const exempt = this.reflector.getAllAndOverride<boolean | undefined>(
      ADMIN_ALLOW_WITHOUT_2FA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (exempt) return;
    throw new ForbiddenException(
      i18nMessage("api.adminAuth.n2faKurulumuZorunlu", undefined, ADMIN_2FA_SETUP_REQUIRED_CODE),
    );
  }

  private assertRoleAuthorized(context: ExecutionContext): void {
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ADMIN_ROLES_KEY,
      targets,
    );
    if (required && required.length > 0) {
      const req = context.switchToHttp().getRequest();
      const role = req.user?.role as string | undefined;
      if (!role || !required.includes(role)) {
        throw new ForbiddenException(i18nMessage("api.adminAuth.buIslemIcinYetkinizYok"));
      }
      return;
    }

    // Rol kısıtı yok — yalnız açıkça "tüm rollere açık" işaretlenmişse geçer.
    const allowAny = this.reflector.getAllAndOverride<boolean | undefined>(
      ADMIN_ANY_ROLE_KEY,
      targets,
    );
    if (allowAny) return;

    // Fail-closed: işaretlenmemiş uç reddedilir.
    throw new ForbiddenException(i18nMessage("api.adminAuth.buIslemIcinYetkinizYok"));
  }
}
