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
import {
  AuthenticatedSupplierUser,
  CurrentSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import {
  AddProfilePhotoDto,
  FinalizeCoverDto,
  RequestProfileUploadDto,
} from "../dto/request-profile-upload.dto";
import { ImportWebsiteDto } from "../dto/import-website.dto";
import { UpdateCompanyInfoDto } from "../dto/update-company-info.dto";
import { UpdatePublicProfileDto } from "../dto/update-public-profile.dto";
import { UpdateSupplierCategoriesDto } from "../dto/update-supplier-categories.dto";
import { SupplierProfileService } from "../services/supplier-profile.service";

@UseGuards(SupplierJwtAuthGuard)
@Controller("supplier-profile")
export class SupplierProfileController {
  constructor(private readonly service: SupplierProfileService) {}

  @Get("me/categories")
  getCategories(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.getCategories(user.supplierUserId);
  }

  @Patch("me/categories")
  updateCategories(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: UpdateSupplierCategoriesDto,
  ) {
    return this.service.updateCategories(user.supplierUserId, dto.categoryIds);
  }

  // Çekirdek firma bilgisi (iletişim/adres) self-servis düzenleme
  @Patch("me/company-info")
  updateCompanyInfo(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: UpdateCompanyInfoDto,
  ) {
    return this.service.updateCompanyInfo(user.supplierUserId, dto);
  }

  // V2-PUBLIC-PROFILE — PREMIUM tedarikçi public profil editör endpoint'leri
  @Get("me/public-profile")
  getPublicProfile(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.getPublicProfile(user.supplierUserId);
  }

  @Post("me/public-profile/import-from-website")
  importFromWebsite(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: ImportWebsiteDto,
  ) {
    return this.service.importFromWebsite(user.supplierUserId, dto.website);
  }

  @Patch("me/public-profile")
  updatePublicProfile(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: UpdatePublicProfileDto,
  ) {
    return this.service.updatePublicProfile(user.supplierUserId, dto);
  }

  // ===== Cover image =====

  @Post("me/public-profile/cover/upload-url")
  requestCoverUploadUrl(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: RequestProfileUploadDto,
  ) {
    return this.service.requestCoverUpload(user.supplierUserId, dto);
  }

  @Post("me/public-profile/cover/finalize")
  finalizeCover(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: FinalizeCoverDto,
  ) {
    return this.service.finalizeCover(user.supplierUserId, dto);
  }

  @Delete("me/public-profile/cover")
  removeCover(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.removeCover(user.supplierUserId);
  }

  // ===== Logo (profil resmi) =====

  @Post("me/public-profile/logo/upload-url")
  requestLogoUploadUrl(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: RequestProfileUploadDto,
  ) {
    return this.service.requestLogoUpload(user.supplierUserId, dto);
  }

  @Post("me/public-profile/logo/finalize")
  finalizeLogo(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: FinalizeCoverDto,
  ) {
    return this.service.finalizeLogo(user.supplierUserId, dto);
  }

  @Delete("me/public-profile/logo")
  removeLogo(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.removeLogo(user.supplierUserId);
  }

  // ===== Gallery photos =====

  @Post("me/public-profile/photos/upload-url")
  requestPhotoUploadUrl(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: RequestProfileUploadDto,
  ) {
    return this.service.requestPhotoUpload(user.supplierUserId, dto);
  }

  @Post("me/public-profile/photos")
  addPhoto(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: AddProfilePhotoDto,
  ) {
    return this.service.addPhoto(user.supplierUserId, dto);
  }

  @Delete("me/public-profile/photos/:id")
  removePhoto(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.removePhoto(user.supplierUserId, id);
  }
}
