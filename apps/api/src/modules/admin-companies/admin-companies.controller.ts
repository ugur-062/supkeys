import {
  Body,
  Controller,
  Delete,
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
import { AllowAnyAdminRole } from "../admin-auth/decorators/allow-any-admin-role.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ExtendMembershipDto {
  @IsInt()
  @Min(1)
  @Max(60)
  months!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class MembershipReportDto {
  /** ISO tarih (YYYY-MM-DD) — aralık başı. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;
}

class AddNoteDto {
  @IsString()
  @MaxLength(2000)
  body!: string;
}

class NotifyDto {
  @IsString()
  @MaxLength(150)
  subject!: string;

  @IsString()
  @MaxLength(3000)
  message!: string;
}

class AnnounceDto {
  @IsString()
  @MaxLength(150)
  subject!: string;

  @IsString()
  @MaxLength(3000)
  message!: string;

  @IsOptional()
  @IsIn(["PAKET", "STANDARD"])
  tier?: "PAKET" | "STANDARD";

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
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
  constructor(
    private readonly service: AdminCompaniesService,
    private readonly supabase: SupabaseAuthService,
  ) {}

  @Get("companies")
  // Liste projeksiyonu taxNumber (KYC PII) içerir → detail ile simetrik:
  // salt-okuma SUPPORT rolüne kapalı.
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  list(@Query() query: ListCompaniesDto) {
    return this.service.list(query);
  }

  // ":id"den ÖNCE — aksi halde "stats" bir firma id'si sanılırdı.
  @Get("companies/stats")
  @AllowAnyAdminRole() // yalnız agregat sayaç, PII yok — tüm rollere açık
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
    return this.service.setTier(id, dto.tier, dto.months, admin.id, dto.reason);
  }

  @Post("companies/:id/membership/extend")
  // Uzatma = satış işlemi — SALES de yapabilir (tier ver/al SUPER_ADMIN kalır).
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  extendMembership(
    @Param("id") id: string,
    @Body() dto: ExtendMembershipDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.extendMembership(id, dto.months, admin.id, dto.reason);
  }

  @Get("companies/:id/membership/history")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  membershipHistory(@Param("id") id: string) {
    return this.service.membershipHistory(id);
  }

  // ":id"den etkilenmez — "companies/:id" pattern'iyle çakışmayan ayrı yol.
  @Get("membership/report")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  membershipReport(@Query() dto: MembershipReportDto) {
    return this.service.membershipReport(dto.from, dto.to);
  }

  // ── KVKK (Faz 9) ──
  @Get("companies/:id/export")
  @RequireAdminRole("SUPER_ADMIN")
  exportData(@Param("id") id: string) {
    return this.service.exportData(id);
  }

  @Delete("companies/:id")
  @RequireAdminRole("SUPER_ADMIN")
  deleteCompany(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.deleteOrAnonymize(id, admin.id, (authId) =>
      this.supabase.deleteUser(authId),
    );
  }

  @Get("complaints")
  @AllowAnyAdminRole() // SUPPORT şikayet triyajı yapabilir; resolve gated kalır
  complaints(
    @Query("status") status?: string,
    @Query("companyId") companyId?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.listComplaints(
      status,
      companyId,
      q,
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
  }

  // ── Dahili notlar (Faz 6) ──
  // Dahili notlar hassastır; deleteNote zaten SUPER_ADMIN — oku/yaz da gated
  // (asimetri kapatıldı). Salt-okuma SUPPORT rolüne kapalı.
  @Get("companies/:id/notes")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  listNotes(@Param("id") id: string) {
    return this.service.listNotes(id);
  }

  @Post("companies/:id/notes")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  addNote(
    @Param("id") id: string,
    @Body() dto: AddNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.addNote(id, dto.body, admin.id);
  }

  @Delete("notes/:noteId")
  @RequireAdminRole("SUPER_ADMIN")
  deleteNote(
    @Param("noteId") noteId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.deleteNote(noteId, admin.id);
  }

  // ── Global arama (Faz 6) ──
  // Firmalar arası arama PII (taxNumber vb.) yüzeyi açar → gated.
  @Get("search")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  search(@Query("q") q?: string) {
    return this.service.globalSearch(q ?? "");
  }

  // ── Bildirim + duyuru (Faz 6) ──
  @Post("companies/:id/notify")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  notify(
    @Param("id") id: string,
    @Body() dto: NotifyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.sendNotification(id, dto.subject, dto.message, admin.id);
  }

  @Post("announcements")
  @RequireAdminRole("SUPER_ADMIN")
  announce(
    @Body() dto: AnnounceDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.announce(dto, admin.id);
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
