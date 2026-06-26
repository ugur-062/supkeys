import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyQuestionTemplatesService } from "./company-question-templates.service";
import { SaveQuestionTemplateDto } from "./dto/save-question-template.dto";

@Controller("company/question-templates")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyQuestionTemplatesController {
  constructor(private readonly service: CompanyQuestionTemplatesService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  getOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getOne(user.companyId, id);
  }

  @Post()
  save(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: SaveQuestionTemplateDto,
  ) {
    return this.service.save(user.companyId, dto);
  }
}
