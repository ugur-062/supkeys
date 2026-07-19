import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { setTenantContext } from "./tenant-context";

/**
 * Guard'lardan SONRA çalışır (Nest: guard → interceptor) → `req.user` hazır.
 * Auth'la doğrulanmış firmanın companyId'sini (varsa) TENANT bağlamına yazar.
 * Admin token'ı companyId taşımaz → realm "admin", companyId null (ileride
 * bypass). Auth'suz istek → req.user yok → bağlam null kalır (pre-context).
 *
 * Sorgu davranışını DEĞİŞTİRMEZ (Faz 1a).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() === "http") {
      const req = context.switchToHttp().getRequest<{
        user?: { companyId?: unknown };
      }>();
      const companyId = req.user?.companyId;
      if (typeof companyId === "string" && companyId.length > 0) {
        setTenantContext(companyId, "company");
      } else if (req.user) {
        // Kimlik var ama companyId yok (admin realm) → bypass sinyali.
        setTenantContext(null, "admin");
      }
    }
    return next.handle();
  }
}
