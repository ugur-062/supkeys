import { ForbiddenException, Injectable } from "@nestjs/common";
import { hasManagementRole } from "../company-auth/permissions/company-permissions.constants";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { AuditService } from "../audit/audit.service";

/**
 * Faz O — firma-yüzü aktivite logu: İŞ aktivitesi (kim ihale açtı, kim IBAN
 * değiştirdi [maskeli referans], kim kullanıcı ekledi/onayladı) — teknik
 * log/IP/stack DEĞİL. Görüntüleme Kurucu+Yönetici'ye (etiket yetkisi);
 * tier kapısı (Silver+) controller guard'ında.
 */
@Injectable()
export class CompanyActivityService {
  constructor(private readonly audit: AuditService) {}

  async list(
    user: AuthenticatedCompanyUser,
    query: { page?: number; pageSize?: number; module?: string },
  ) {
    if (!user.isOwner && !hasManagementRole(user.roles)) {
      throw new ForbiddenException(
        "Aktivite logunu yalnızca Kurucu veya Yönetici görüntüleyebilir",
      );
    }
    return this.audit.queryForTenant(user.companyId, query);
  }
}
