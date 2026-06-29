import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanySupplierTemplatesService } from "./company-supplier-templates.service";

class CreateSupplierTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Type(() => String)
  memberCompanyIds!: string[];
}

class UpdateSupplierTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Type(() => String)
  memberCompanyIds?: string[];
}

@Controller("company/supplier-templates")
@UseGuards(CompanyJwtAuthGuard)
export class CompanySupplierTemplatesController {
  constructor(private readonly service: CompanySupplierTemplatesService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  findOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.findOne(user.companyId, id);
  }

  @Post()
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CreateSupplierTemplateDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(":id")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateSupplierTemplateDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user, id);
  }
}
