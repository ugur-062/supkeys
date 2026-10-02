import { i18nMessage } from "../../../common/i18n/http-i18n";
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
import { tierAtLeast, type TierName } from "@rothern/shared";
import { COMPANY_TIER_KEY } from "../decorators/require-tier.decorator";
import { tierRequiredError } from "./company-paid-tier.guard";

/**
 * CompanyJwtAuthGuard'dan SONRA çalışır (request.user dolu). Handler/class'taki
 * @RequireCompanyPermission metadata'sını okur ve kullanıcının EFEKTİF izin
 * listesinde (kurucu örtük izinleri dahil) gereksinimin bulunup bulunmadığını
 * kontrol eder. Dizi metadata = any-of.
 */
@Injectable()
export class CompanyPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      string | readonly string[] | undefined
    >(COMPANY_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedCompanyUser | undefined;
    if (!user) throw new ForbiddenException(i18nMessage("api.companyAuth.yetkisiz"));

    if (!hasCompanyPermission(user, required)) {
      // PAKET ÖNCE (rol kontrolü paket kontrolünün İÇİNDE; arayüz testi T3):
      // uç @RequireTier taşıyorsa ve kademe yetmiyorsa izin hatası değil paket
      // hatası döner — web de önce paket kilidini çizer. Sınıf düzeyindeki bu
      // guard, handler düzeyindeki CompanyPaidTierGuard'dan ÖNCE koştuğu için
      // sıra burada düzeltilir (guard dizilişine bağlı kalmaz).
      const min = this.reflector.getAllAndOverride<TierName | undefined>(
        COMPANY_TIER_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (min && !tierAtLeast(user.tier, min)) throw tierRequiredError(min);
      throw new ForbiddenException(i18nMessage("api.companyAuth.buIslemIcinYetkinizYok"));
    }
    return true;
  }
}
