import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Trim } from "../../common/decorators/trim.decorator";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { PublicInquiryService } from "./public-inquiry.service";

class ReplyDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(5000) body!: string;
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
@UseGuards(CompanyJwtAuthGuard)
export class CompanyInquiryController {
  constructor(private readonly service: PublicInquiryService) {}

  @Get("received")
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
  sent(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listClaimed(user.companyId, user.email);
  }

  @Post(":id/reply")
  reply(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.service.reply(user.companyId, user.userId, id, dto.body);
  }
}
