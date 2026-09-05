import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { AiService } from "./ai.service";

/**
 * Faz AI-0 — AI kullanım ekranı. Silver+ (CompanyPaidTierGuard) + servis içinde
 * rol şekillendirmesi: Kurucu/Yönetici firma kırılımını, SA/ST yalnız kendi
 * kullanımını görür; diğerleri 403. Yanıtta YALNIZ yüzde — dolar/model sızmaz.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class AiUsageController {
  constructor(private readonly ai: AiService) {}

  @Get("usage")
  @RequireCompanyPermission(["users:manage", "company:manage", ...ALL_SEAT_PERMISSIONS])
  usage(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.ai.usageView(user);
  }
}
