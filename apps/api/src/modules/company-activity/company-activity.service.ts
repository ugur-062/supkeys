import { ForbiddenException, Injectable } from "@nestjs/common";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { AuditService } from "../audit/audit.service";

/** Aktivite logunu açan yönetim izinleri (controller dekoratörüyle AYNI). */
export const ACTIVITY_LOG_PERMISSIONS = ["users:manage", "company:manage"] as const;

/**
 * Faz O — firma-yüzü aktivite logu: İŞ aktivitesi (kim ihale açtı, kim IBAN
 * değiştirdi [maskeli referans], kim kullanıcı ekledi/onayladı) — teknik
 * log/IP/stack DEĞİL. Görüntüleme yönetim iznine (kullanıcı-yetki VEYA firma
 * ayarları); tier kapısı (Silver+) controller guard'ında.
 */
@Injectable()
export class CompanyActivityService {
  constructor(private readonly audit: AuditService) {}

  async list(
    user: AuthenticatedCompanyUser,
    query: { page?: number; pageSize?: number; module?: string },
  ) {
    if (!hasCompanyPermission(user, ACTIVITY_LOG_PERMISSIONS)) {
      throw new ForbiddenException(
        "Aktivite logunu yalnızca yönetim yetkisi taşıyanlar görüntüleyebilir",
      );
    }
    return this.audit.queryForTenant(user.companyId, query);
  }
}
