import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyBlocksService } from "./company-blocks.service";

class BlockDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  rothernId!: string;

  // Opsiyonel gerekçe — kayda geçer (eski sistemde engelleme gerekçeliydi).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller("company/blocks")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyBlocksController {
  constructor(private readonly service: CompanyBlocksService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user);
  }

  @Post()
  @RequireCompanyPermission("connections:manage")
  block(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: BlockDto,
  ) {
    return this.service.block(user, dto.rothernId, dto.reason);
  }

  @Delete(":companyId")
  @RequireCompanyPermission("connections:manage")
  unblock(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("companyId") companyId: string,
  ) {
    return this.service.unblock(user, companyId);
  }
}
