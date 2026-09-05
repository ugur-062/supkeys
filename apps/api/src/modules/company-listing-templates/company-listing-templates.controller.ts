import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IsObject,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyListingTemplatesService } from "./company-listing-templates.service";

class SaveTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

@Controller("company/listing-templates")
// İhale şablonları premium özelliğidir — STANDARD firma erişemez.
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class CompanyListingTemplatesController {
  constructor(private readonly service: CompanyListingTemplatesService) {}

  // Okuma her role açık; yazma templates:manage ister (ONAYLAYICI vb. CRUD yapamaz).
  @Get()
  @RequireCompanyPermission("buy:view")
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  @RequireCompanyPermission("templates:manage")
  save(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: SaveTemplateDto,
  ) {
    return this.service.save(user, dto);
  }

  @Delete(":id")
  @RequireCompanyPermission("templates:manage")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user, id);
  }
}
