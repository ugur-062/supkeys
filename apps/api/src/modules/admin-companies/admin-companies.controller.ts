import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { AdminCompaniesService } from "./admin-companies.service";

class SuspendDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class SetTierDto {
  @IsIn(["STANDARD", "PAKET"])
  tier!: "STANDARD" | "PAKET";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;
}

class ResolveComplaintDto {
  @IsIn(["RESOLVED", "DISMISSED"])
  status!: "RESOLVED" | "DISMISSED";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;

  @IsOptional()
  @IsBoolean()
  suspend?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  suspendReason?: string;
}

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminCompaniesController {
  constructor(private readonly service: AdminCompaniesService) {}

  @Get("companies")
  list(
    @Query("status") status?: string,
    @Query("blocked") blocked?: string,
    @Query("q") q?: string,
  ) {
    return this.service.list({ status, blocked, q });
  }

  @Get("companies/:id")
  // Detay KYC PII (vergi/sicil/imza/kimlik presigned URL'leri) döndürür →
  // salt-okuma SUPPORT rolüne kapalı; yalnız doğrulama yapan roller.
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }

  @Post("companies/:id/verify")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  verify(@Param("id") id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.setVerification(id, "VERIFIED", admin.id);
  }

  @Post("companies/:id/reject")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  reject(@Param("id") id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.setVerification(id, "REJECTED", admin.id);
  }

  @Post("companies/:id/suspend")
  @RequireAdminRole("SUPER_ADMIN")
  suspend(
    @Param("id") id: string,
    @Body() dto: SuspendDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.suspend(id, dto.reason ?? "", admin.id);
  }

  @Post("companies/:id/unsuspend")
  @RequireAdminRole("SUPER_ADMIN")
  unsuspend(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.unsuspend(id, admin.id);
  }

  @Post("companies/:id/tier")
  @RequireAdminRole("SUPER_ADMIN")
  setTier(
    @Param("id") id: string,
    @Body() dto: SetTierDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.setTier(id, dto.tier, dto.months, admin.id);
  }

  @Get("complaints")
  complaints(@Query("status") status?: string) {
    return this.service.listComplaints(status);
  }

  @Post("complaints/:id/resolve")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveComplaintDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.resolveComplaint(id, dto, admin.id);
  }
}
