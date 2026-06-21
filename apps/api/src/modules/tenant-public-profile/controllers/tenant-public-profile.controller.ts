import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  type AuthenticatedUser,
  CurrentUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ImportFromWebsiteDto } from "../dto/import-from-website.dto";
import {
  FinalizeTenantImageDto,
  RequestTenantUploadDto,
} from "../dto/tenant-upload.dto";
import { UpdateTenantPublicProfileDto } from "../dto/update-tenant-public-profile.dto";
import { TenantPublicProfileService } from "../services/tenant-public-profile.service";

/**
 * Tenant tarafı public profil editörü. Firma ayarları gibi COMPANY_ADMIN korumalı.
 */
@Controller("tenants/me/public-profile")
@UseGuards(JwtAuthGuard)
export class TenantPublicProfileController {
  constructor(private readonly service: TenantPublicProfileService) {}

  @Get()
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMine(user.tenantId);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantPublicProfileDto,
  ) {
    return this.service.updateMine(user.tenantId, dto);
  }

  @Post("import-from-website")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  importFromWebsite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportFromWebsiteDto,
  ) {
    return this.service.importFromWebsite(user.tenantId, dto.website);
  }

  // ===== Logo =====
  @Post("logo/upload-url")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  requestLogoUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestTenantUploadDto,
  ) {
    return this.service.requestUpload(user.tenantId, "logo", dto);
  }

  @Post("logo/finalize")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  finalizeLogo(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FinalizeTenantImageDto,
  ) {
    return this.service.finalize(user.tenantId, "logo", dto);
  }

  @Delete("logo")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  removeLogo(@CurrentUser() user: AuthenticatedUser) {
    return this.service.removeImage(user.tenantId, "logo");
  }

  // ===== Cover =====
  @Post("cover/upload-url")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  requestCoverUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestTenantUploadDto,
  ) {
    return this.service.requestUpload(user.tenantId, "cover", dto);
  }

  @Post("cover/finalize")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  finalizeCover(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FinalizeTenantImageDto,
  ) {
    return this.service.finalize(user.tenantId, "cover", dto);
  }

  @Delete("cover")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  removeCover(@CurrentUser() user: AuthenticatedUser) {
    return this.service.removeImage(user.tenantId, "cover");
  }
}
