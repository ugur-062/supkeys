import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Trim } from "../../common/decorators/trim.decorator";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { PublicInquiryService } from "./public-inquiry.service";

class ReplyDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(5000) body!: string;
}

/**
 * Kayıtlı alıcının bilgi talebi. KİMLİK ALANI YOK — ad/e-posta/firma
 * oturumdan gelir; gövdeden alsaydık kullanıcı başka bir kimlikle
 * gönderebilirdi ve satıcı yanlış firmayı görürdü.
 */
class CreateCompanyInquiryDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(120) companySlug!: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(160) productSlug!: string;
  @Trim() @IsString() @MinLength(10) @MaxLength(5000) message!: string;
  /** Serbest metin miktar beyanı ("500 adet") — yapılandırılmış alan değil. */
  @IsOptional() @Trim() @IsString() @MaxLength(60) quantity?: string;
}

/**
 * Bilgi talepleri — SATICI tarafı (giriş gerektirir).
 *
 * İki yön var ve ikisi de aynı tabloyu okur:
 *   `/received` → firmanın ÜRÜNLERİNE gelen talepler (satıcı gözü)
 *   `/sent`     → kullanıcının misafirken gönderdiği ve kaydolunca hesabına
 *                 bağlanan talepler (alıcı gözü)
 *
 * Pazar yeri anahtarına TABİ DEĞİL: anahtar kapansa bile daha önce gelmiş
 * talepler ve yanıtlar okunabilmeli — aksi hâlde satıcı, cevaplamayı taahhüt
 * ettiği bir mesajı göremez hâle gelirdi.
 */
@Controller("company/inquiries")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyInquiryController {
  constructor(private readonly service: PublicInquiryService) {}

  /** Ürünlerime gelen talepler — satış tarafı görüntüleme. */
  @Get("received")
  @RequireCompanyPermission("sell:view")
  received(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("page") page?: string,
  ) {
    const n = Number.parseInt(page ?? "1", 10);
    return this.service.listForCompany(
      user.companyId,
      Number.isFinite(n) ? n : 1,
    );
  }

  /**
   * Kullanıcının MİSAFİRKEN gönderdiği talepler. Hesaba bağlama bu çağrıda
   * TEMBEL yapılır (gerekçe serviste) — sayfaya her giriş idempotenttir.
   */
  @Get("sent")
  @RequireCompanyPermission("buy:view")
  sent(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listClaimed(user.companyId, user.email);
  }

  /**
   * Kayıtlı alıcının talebi. İzin: "Bilgi talebi gönderme" (ALIM tarafı işlem
   * izni; Kurucu/Yönetici etiketi tek başına yetmez — Faz R). KYC istenmiyor —
   * bu bir para taahhüdü değil, mesaj sınıfından bir eylem (CLAUDE.md KYC
   * kapısı tablosu).
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireCompanyPermission("buy:inquiry:send")
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CreateCompanyInquiryDto,
  ) {
    return this.service.createAsCompany({
      companyId: user.companyId,
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      companySlug: dto.companySlug,
      productSlug: dto.productSlug,
      message: dto.message,
      quantity: dto.quantity,
    });
  }

  /** Yanıt firma adına gider — "Bilgi taleplerini yanıtlama" işlem izni. */
  @Post(":id/reply")
  @RequireCompanyPermission("sell:inquiry:reply")
  reply(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.service.reply(user.companyId, user.userId, id, dto.body);
  }
}
