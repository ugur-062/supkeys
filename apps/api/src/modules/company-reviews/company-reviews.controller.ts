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
@UseGuards(CompanyJwtAuthGuard)
export class CompanyReviewsController {
  constructor(private readonly service: CompanyReviewsService) {}

  @Post()
  upsert(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpsertReviewDto,
  ) {
    return this.service.upsert(user, dto);
  }

  @Get("order/:orderId")
  forOrder(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("orderId") orderId: string,
  ) {
    return this.service.getForOrder(user, orderId);
  }

  @Get("company/:companyId")
  forCompany(@Param("companyId") companyId: string) {
    return this.service.listForCompany(companyId);
  }
}
