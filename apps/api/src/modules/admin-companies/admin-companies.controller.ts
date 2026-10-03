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
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import {
  VERIFICATION_REASON_CODES,
  type VerificationReasonCode,
} from "@rothern/shared";
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

  /** Faz Y: "kyc" → başvuru kuyruğu (PENDING + bekleyen belge-revizyonlular). */
  @IsOptional()
  @IsIn(["kyc"])
  queue?: string;

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
  @IsIn(["STANDART", "SILVER", "GOLD"])
  tier?: string;

  /** "oldest" = KYC kuyruğu için en-eski-önce (varsayılan: en yeni). */
  @IsOptional()
  @IsIn(["newest", "oldest"])
  sort?: string;

  /**
   * "30" → 30 gün içinde bitecek PAKET üyelikler (pano "Süresi Yaklaşan
   * Üyelikler" ile aynı tanım), bitişi en yakın önce (arayüz testi D-146).
   */
  @IsOptional()
  @IsIn(["30"])
  expiring?: string;

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

/**
 * Firma doğrulama reddi — gerekçe ZORUNLU (firmaya Doğrulama sayfasında
 * gösterilir). UI kilidi ≠ API kilidi: 2026-09-11 staging QA'da gövdesiz istek
 * 201 dönüyordu.
 *
 * KODLU GEREKÇE (2026-09-27): `reasonCode` (firmanın dilinde katalogdan
 * çevrilir) VEYA ≥3 karakterlik serbest not zorunlu — kural serviste
 * (`requireRejectReason`), çünkü iki alandan biri yeter.
 */
class RejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn(VERIFICATION_REASON_CODES as unknown as string[])
  reasonCode?: VerificationReasonCode;
}

/**
 * Belge bazlı inceleme kararları — { [docKind]: { status, reason?, reasonCode?, key? } }.
 * `key` = incelenen nesnenin R2 anahtarı (denetim 2026-08-26 Parça 9 #3):
 * gönderilirse karar O nesneye sabitlenir; arada belge değişmişse 409 döner.
 * İç nesne serbest biçimli (`IsObject`) → `reasonCode` serviste doğrulanır.
 */
class ReviewDocsDto {
  @IsObject()
  decisions!: Partial<
    Record<
      DocKind,
      {
        status: "APPROVED" | "REJECTED";
        reason?: string;
        reasonCode?: VerificationReasonCode;
        key?: string;
      }
    >
  >;
}

/** Faz Y A-modeli — tekil belge-güncelleme revizyonu kararı. */
class ReviewDocRevisionDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn(VERIFICATION_REASON_CODES as unknown as string[])
  reasonCode?: VerificationReasonCode;
}

/** Firma kimlik düzeltme — yalnız gönderilen alanlar değişir. */
export class UpdateCompanyProfileDto {
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

  /** Hukuki yapı (2026-09-27): OTHER seçilince `legalFormLocal` zorunlu (serviste). */
  @IsOptional()
  @IsIn(["JOINT_STOCK", "LIMITED", "SOLE_PROPRIETOR", "OTHER"])
  companyType?: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR" | "OTHER";

  /** Yerel hukuki yapı adı (GmbH, LLC, ООО…) — onboarding DTO'suyla aynı tavan. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  legalFormLocal?: string | null;

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

  /**
   * Doluysa firmanin TUM firma-duzeyi e-postalari (siparis, dogrulama, uyelik,
   * baglanti) kullanicilar yerine bu adrese gider — bicim hatasi firmanin
   * butun e-posta akisini sessizce keser (derin denetim MU-02). Bos string
   * alani temizler (serviste null'a normalize edilir); dolu deger e-posta
   * olmali, kucuk harfe cevrilip saklanir.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @ValidateIf((o: { billingEmail?: unknown }) => o.billingEmail !== "")
  @IsString()
  @IsEmail()
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

  /** IBAN kullanmayan ülkede zorunlu; doğrulamada her ülkede (2026-09-27). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankSwiftBic?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankName?: string | null;
}

class SetTierDto {
  @IsIn(["STANDART", "SILVER", "GOLD"])
  tier!: "STANDART" | "SILVER" | "GOLD";

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

/**
 * Tarih biçimi DTO'da (derin denetim LU-03): eskiden yalnız `@IsString
 * @MaxLength(10)` vardı; "2026-13-01" / "abc" servis içinde Invalid Date
 * üretip Prisma'ya gidiyor, 400 yerine 500 dönüyordu. `strict` ISO 8601 ay/gün
 * geçerliliğini de denetler (13. ay, 30 Şubat red).
 */
export class MembershipReportDto {
  /** ISO tarih (YYYY-MM-DD) — aralık başı. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to?: string;
}

/**
 * Şikayet listesi sorgusu (derin denetim LU-03): parametreler eskiden ham
 * `@Query` string'i idi — `status=open` doğrulanmadan Prisma enum süzgecine,
 * `page=abc` `parseInt` ile NaN olarak `skip`'e gidiyor, 400 yerine 500
 * dönüyordu.
 */
export class ListComplaintsDto {
  @IsOptional()
  @IsIn(["OPEN", "RESOLVED", "DISMISSED"])
  status?: "OPEN" | "RESOLVED" | "DISMISSED";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

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
  @IsIn(["STANDART", "SILVER", "GOLD"])
  tier?: "STANDART" | "SILVER" | "GOLD";

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  /** Dalga B: göndermeden gerçek hedef sayısını sor (onay ekranı için). */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
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
  @AllowAnyAdminRole() // agregat sayaçlar tüm rollere açık
  stats(@CurrentAdmin() admin: AuthenticatedAdmin) {
    // Firma satırları (bitmek üzere üyelik arama listesi) satış verisidir:
    // salt-okuma SUPPORT yalnız SAYIYI görür (arayüz testi D-182).
    return this.service.stats({ rowsAllowed: admin.role !== "SUPPORT" });
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
    return this.service.setVerification(
      id,
      "REJECTED",
      admin.id,
      dto.reason,
      dto.reasonCode,
    );
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

  @Post("companies/:id/doc-revisions/:revId/review")
  // Faz Y A-modeli: VERIFIED firmanın belge güncellemesi — tekil onay/red.
  // Ret'te eski belge geçerli kalır; firma statüsü değişmez.
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  reviewDocRevision(
    @Param("id") id: string,
    @Param("revId") revId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ReviewDocRevisionDto,
  ) {
    return this.service.reviewDocRevision(id, revId, dto, admin.id);
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
  exportData(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.exportData(id, { id: admin.id, email: admin.email });
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
  complaints(@Query() query: ListComplaintsDto) {
    return this.service.listComplaints(
      query.status,
      query.companyId,
      query.q,
      query.page,
      query.pageSize,
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
    // #2: aktörün ROLÜ servise geçer — `suspend` bayrağı SUPER_ADMIN ister.
    return this.service.resolveComplaint(id, dto, admin.id, admin.role);
  }
}
