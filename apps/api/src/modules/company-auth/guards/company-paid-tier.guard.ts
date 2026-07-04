import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
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
    if (user.tier !== "PAKET") {
      throw new ForbiddenException(
        "Bu özellik premium (PAKET) üyelik gerektirir. Standart üyeler yalnızca teklif verebilir.",
      );
    }
    return true;
  }
}
