import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  IsOptional,
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
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyComplaintsService } from "./company-complaints.service";

class FileComplaintDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  rothernId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;
}

@Controller("company/complaints")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyComplaintsController {
  constructor(private readonly service: CompanyComplaintsService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listMine(user);
  }

  @Post()
  @RequireCompanyPermission("connections:manage")
  file(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: FileComplaintDto,
  ) {
    return this.service.file(user, dto);
  }
}
