import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyQuestionTemplatesService } from "./company-question-templates.service";
import { SaveQuestionTemplateDto } from "./dto/save-question-template.dto";

@Controller("company/question-templates")
// Soru seti şablonları premium özelliğidir — STANDARD firma erişemez.
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class CompanyQuestionTemplatesController {
  constructor(private readonly service: CompanyQuestionTemplatesService) {}

  // Okuma her role açık; yazma templates:manage ister.
  @Get()
  @RequireCompanyPermission("buy:view")
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  @RequireCompanyPermission("buy:view")
  getOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getOne(user.companyId, id);
  }

  @Post()
  @RequireCompanyPermission("templates:manage")
  save(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: SaveQuestionTemplateDto,
  ) {
    return this.service.save(user.companyId, dto);
  }

  @Put(":id")
  @RequireCompanyPermission("templates:manage")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: SaveQuestionTemplateDto,
  ) {
    return this.service.update(user.companyId, id, dto);
  }

  @Delete(":id")
  @RequireCompanyPermission("templates:manage")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user.companyId, id);
  }
}
