import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, MaxLength } from "class-validator";
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
  @IsOptional() @IsInt() fileSize?: number;
}
class CommitDto {
  @IsString() kind!: string;
  @IsString() key!: string;
}
/** Doğrulamaya gönderim — belgelerle birlikte KYC kimlik bilgileri. */
class SubmitDocsDto {
  @IsOptional() @IsString() @MaxLength(20) mersisNo?: string;
  @IsOptional() @IsString() @MaxLength(30) tradeRegistryNo?: string;
  @IsOptional() @IsString() @MaxLength(40) iban?: string;
  @IsOptional() @IsString() @MaxLength(120) ibanHolder?: string;
}

@Controller("company/docs")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyDocsController {
  constructor(private readonly service: CompanyDocsService) {}

  @Get()
  // KYC belgeleri (vergi levhası/sicil/imza sirküleri/kimlik) hassas PII —
  // presigned URL'leri yalnız company:manage yetkisi olan kullanıcı alabilir
  // (düşük yetkili operasyon rolleri firmanın KYC'sini çekemesin).
  @RequireCompanyPermission("company:manage")
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
      dto.fileSize,
    );
  }

  @Post("commit")
  @RequireCompanyPermission("company:manage")
  commit(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CommitDto,
  ) {
    return this.service.commit(user.companyId, dto.kind, dto.key, user);
  }

  @Post("submit")
  @RequireCompanyPermission("company:manage")
  submit(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: SubmitDocsDto,
  ) {
    return this.service.submit(user.companyId, dto, user);
  }
}
