import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { DocKind } from "../company-docs/company-docs.service";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { AdminCompaniesService } from "./admin-companies.service";

class ListCompaniesDto {
  @IsOptional()
  @IsIn(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"])
  status?: string;

  @IsOptional()
  @IsIn(["true"])
  blocked?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  /** ISO 3166-1 alpha-2 (TR, DE, ...) */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @IsIn(["STANDARD", "PAKET"])
  tier?: string;

  /** "oldest" = KYC kuyruğu için en-eski-önce (varsayılan: en yeni). */
  @IsOptional()
  @IsIn(["newest", "oldest"])
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class SuspendDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class RejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Belge bazlı inceleme kararları — { [docKind]: { status, reason? } }. */
class ReviewDocsDto {
  @IsObject()
  decisions!: Partial<
    Record<DocKind, { status: "APPROVED" | "REJECTED"; reason?: string }>
  >;
}

/** Firma kimlik düzeltme — yalnız gönderilen alanlar değişir. */
class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxOffice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mersisNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tradeRegistryNo?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateRegion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  addressLine?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  iban?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ibanHolder?: string | null;
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
  list(@Query() query: ListCompaniesDto) {
    return this.service.list(query);
  }

  // ":id"den ÖNCE — aksi halde "stats" bir firma id'si sanılırdı.
  @Get("companies/stats")
  stats() {
    return this.service.stats();
  }

  @Get("companies/:id")
  // Detay KYC PII (vergi/sicil/imza/kimlik presigned URL'leri) döndürür →
  // salt-okuma SUPPORT rolüne kapalı; yalnız doğrulama yapan roller.
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }

  @Post("companies/:id/profile")
  // Kimlik düzeltme ("yanlış yazdım" çağrıları) — KYC yapan roller.
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  updateProfile(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    return this.service.updateProfile(id, dto, admin.id);
  }

  @Post("companies/:id/verify")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  verify(@Param("id") id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.setVerification(id, "VERIFIED", admin.id);
  }

  @Post("companies/:id/reject")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  reject(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: RejectDto,
  ) {
    return this.service.setVerification(id, "REJECTED", admin.id, dto.reason);
  }

  @Post("companies/:id/review")
  // Belge bazlı onay/red — bazı belgeler reddedilse bile firma yalnız onları
  // yeniden yükler (onaylananlar kilitli kalır).
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  review(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ReviewDocsDto,
  ) {
    return this.service.reviewDocuments(id, dto.decisions, admin.id);
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
  complaints(
    @Query("status") status?: string,
    @Query("companyId") companyId?: string,
  ) {
    return this.service.listComplaints(status, companyId);
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
