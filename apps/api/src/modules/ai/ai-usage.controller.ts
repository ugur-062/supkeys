import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { AiService } from "./ai.service";

/**
 * Faz AI-0 — AI kullanım ekranı. Silver+ (CompanyPaidTierGuard) + servis içinde
 * rol şekillendirmesi: Kurucu/Yönetici firma kırılımını, SA/ST yalnız kendi
 * kullanımını görür; diğerleri 403. Yanıtta YALNIZ yüzde — dolar/model sızmaz.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class AiUsageController {
  constructor(private readonly ai: AiService) {}

  @Get("usage")
  usage(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.ai.usageView(user);
  }
}
