import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { tierAtLeast } from "@rothern/shared";
import type { AuthenticatedCompanyUser } from "../strategies/company-jwt.strategy";

/**
 * PAKET (premium) üyelik zorunlu — CompanyJwtAuthGuard'dan SONRA çalışır
 * (request.user dolu). Yalnız premium firmalara açık controller'ları toptan
 * kapatmak için kullanılır (Raporlar, Şablonlar). STANDARD firma bu uçlara
 * erişemez. İlan açma gibi tekil işlemler servis içinde ayrıca zorlanır; bu
 * guard controller seviyesinde tek noktadan kapıdır.
 */
@Injectable()
export class CompanyPaidTierGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedCompanyUser | undefined;
    if (!user) throw new ForbiddenException("Yetkisiz");
    if (!tierAtLeast(user.tier, "SILVER")) {
      throw new ForbiddenException(
        "Bu özellik Silver veya üzeri paket gerektirir.",
      );
    }
    return true;
  }
}
