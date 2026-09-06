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

const TIER_LABEL: Record<TierName, string> = {
  STANDART: "Standart",
  SILVER: "Silver",
  GOLD: "Gold",
};

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
    if (!user) throw new ForbiddenException("Yetkisiz");
    const min =
      this.reflector.getAllAndOverride<TierName | undefined>(COMPANY_TIER_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? PAID_TIER;
    if (!tierAtLeast(user.tier, min)) {
      throw new ForbiddenException(
        min === "GOLD"
          ? "Bu özellik Gold paket gerektirir (satınalma paneli)."
          : `Bu özellik ${TIER_LABEL[min]} veya üzeri paket gerektirir.`,
      );
    }
    return true;
  }
}
