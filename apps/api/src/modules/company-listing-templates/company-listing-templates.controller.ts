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
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
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
@UseGuards(CompanyJwtAuthGuard)
export class CompanyListingTemplatesController {
  constructor(private readonly service: CompanyListingTemplatesService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  save(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: SaveTemplateDto,
  ) {
    return this.service.save(user, dto);
  }

  @Delete(":id")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user, id);
  }
}
