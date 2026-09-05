import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyReviewsService } from "./company-reviews.service";

class UpsertReviewDto {
  @IsString()
  orderId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  /** "Firma adım referans olarak görünsün" (platform-içi; herkese açıkta asla). */
  @IsOptional()
  @IsBoolean()
  showName?: boolean;
}

@Controller("company/reviews")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyReviewsController {
  constructor(private readonly service: CompanyReviewsService) {}

  @Post()
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  upsert(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpsertReviewDto,
  ) {
    return this.service.upsert(user, dto);
  }

  @Get("order/:orderId")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  forOrder(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("orderId") orderId: string,
  ) {
    return this.service.getForOrder(user, orderId);
  }

  @Get("company/:companyId")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  forCompany(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("companyId") companyId: string,
  ) {
    return this.service.listForCompany(user, companyId);
  }
}
