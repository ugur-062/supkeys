import { i18nMessage } from "../../../common/i18n/http-i18n";
import { entitlementRequiredError } from "../../../common/company/entitlement-required";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PAID_TIER, tierAtLeast, type TierName } from "@rothern/shared";
import type { AuthenticatedCompanyUser } from "../strategies/company-jwt.strategy";
import { COMPANY_TIER_KEY } from "../decorators/require-tier.decorator";

/**
 * PAKET zorunlu — CompanyJwtAuthGuard'dan SONRA çalışır (request.user dolu).
 * Üç paket (2026-09-06): varsayılan eşik SILVER (herhangi bir paket: satış
 * paneli özellikleri, AI, aktivite logu); satınalma paneli özellikleri
 * `@RequireTier("GOLD")` ile GOLD ister (raporlar, şablonlar, onay akışı
 * kurma, talep AI'ı). Tekil işlemler (talep açma) servis içinde ayrıca
 * zorlanır; bu guard controller seviyesinde tek noktadan kapıdır.
 */
@Injectable()
export class CompanyPaidTierGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedCompanyUser | undefined;
    if (!user) throw new ForbiddenException(i18nMessage("api.companyAuth.yetkisiz"));
    const min =
      this.reflector.getAllAndOverride<TierName | undefined>(COMPANY_TIER_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? PAID_TIER;
    if (!tierAtLeast(user.tier, min)) {
      throw tierRequiredError(min, user.companyVerificationStatus);
    }
    return true;
  }
}

/**
 * Kademe kapısının 403'ü — `CompanyPermissionsGuard` da (paket önce kuralı)
 * aynı gövdeyi atar.
 * `TIER_REQUIRED` kodu (arayüz testi O-044): web yakalayıcısı bu kodla
 * toast basmaz — kilitli sayfa zaten kilit kartını çiziyor; kodsuz
 * 403 kartın üstüne gereksiz kırmızı hata toast'ı düşürüyordu.
 *
 * ÜCRETSİZ DÖNEM: metin paket adı anmaz, firma DOĞRULAMASI ister ve durumuna
 * göre ayrışır (tek kaynak `entitlement-required.ts`).
 */
export function tierRequiredError(
  min: TierName,
  verificationStatus: string | null | undefined,
): ForbiddenException {
  return entitlementRequiredError(min, verificationStatus);
}
