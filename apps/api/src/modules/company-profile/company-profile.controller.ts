import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import {
  ProfileImageCommitDto,
  ProfileImageUploadDto,
} from "./dto/profile-image.dto";
import { UpdateCompanyProfileDto } from "./dto/update-company-profile.dto";
import { CompanyProfileService } from "./company-profile.service";

@Controller("company/profile")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  @Get()
  get(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    // Hassas alanlar (TCKN/IBAN/fatura tel) yalnız company:manage yetkisinde döner.
    const canSeeSensitive = hasCompanyPermission(
      user.roles,
      user.isOwner,
      "company:manage",
      user.permissionsOverride,
    );
    return this.service.get(user.companyId, canSeeSensitive);
  }

  @Patch()
  @RequireCompanyPermission("company:manage")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    return this.service.update(user.companyId, dto);
  }

  @Post("image/upload-url")
  @RequireCompanyPermission("company:manage")
  imageUploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ProfileImageUploadDto,
  ) {
    return this.service.requestImageUploadUrl(
      user.companyId,
      dto.kind,
      dto.fileName,
      dto.mimeType,
    );
  }

  @Post("image/commit")
  @RequireCompanyPermission("company:manage")
  imageCommit(@Body() dto: ProfileImageCommitDto) {
    return this.service.resolveUploadedImage(dto.key);
  }
}
