import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { CompanyActivityService } from "./company-activity.service";

/** Modül filtresi — company.<modül>.* action prefix'leri (whitelist). */
const MODULES = [
  "listing",
  "bid",
  "order",
  "user",
  "seats",
  "bank_account",
  "address",
  "docs",
  "approval",
  "connection",
  "profile",
  "signup",
] as const;

class ActivityLogQueryDto {
  @IsOptional()
  @IsIn([...MODULES])
  module?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/**
 * Faz O — firma-yüzü aktivite logu. Silver+ (CompanyPaidTierGuard) + servis
 * içinde Kurucu/Yönetici kapısı. Yalnız kendi tenant'ının company.* eylem
 * kayıtları, sanitize projeksiyon (ip/userAgent yok).
 */
@Controller("company/activity-log")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class CompanyActivityController {
  constructor(private readonly service: CompanyActivityService) {}

  @Get()
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query() query: ActivityLogQueryDto,
  ) {
    return this.service.list(user, query);
  }
}
