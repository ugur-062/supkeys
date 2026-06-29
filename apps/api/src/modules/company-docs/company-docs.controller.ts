import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyDocsService } from "./company-docs.service";

class UploadUrlDto {
  @IsString() kind!: string;
  @IsString() fileName!: string;
  @IsString() mimeType!: string;
}
class CommitDto {
  @IsString() kind!: string;
  @IsString() key!: string;
}

@Controller("company/docs")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyDocsController {
  constructor(private readonly service: CompanyDocsService) {}

  @Get()
  get(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.get(user.companyId);
  }

  @Post("upload-url")
  @RequireCompanyPermission("company:manage")
  uploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UploadUrlDto,
  ) {
    return this.service.uploadUrl(
      user.companyId,
      dto.kind,
      dto.fileName,
      dto.mimeType,
    );
  }

  @Post("commit")
  @RequireCompanyPermission("company:manage")
  commit(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CommitDto,
  ) {
    return this.service.commit(user.companyId, dto.kind, dto.key);
  }

  @Post("submit")
  @RequireCompanyPermission("company:manage")
  submit(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.submit(user.companyId);
  }
}
