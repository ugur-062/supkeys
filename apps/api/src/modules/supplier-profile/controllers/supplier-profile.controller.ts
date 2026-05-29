import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import {
  AuthenticatedSupplierUser,
  CurrentSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
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

  // V2-PUBLIC-PROFILE — PREMIUM tedarikçi public profil editör endpoint'leri
  @Get("me/public-profile")
  getPublicProfile(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.getPublicProfile(user.supplierUserId);
  }

  @Patch("me/public-profile")
  updatePublicProfile(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: UpdatePublicProfileDto,
  ) {
    return this.service.updatePublicProfile(user.supplierUserId, dto);
  }
}
