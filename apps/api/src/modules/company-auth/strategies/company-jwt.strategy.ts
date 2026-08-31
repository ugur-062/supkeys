import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type {
  CompanyRole,
  CompanyTier,
  CompanyVerificationStatus,
} from "@rothern/db";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { readAuthCookie } from "../../../common/auth/cookie";
import { effectiveTier } from "../../../common/company/effective-tier";
import { AUTH_COMPANY_SELECT } from "../../../common/company/auth-company-select";
import type { CompanyPermissionOverride } from "../permissions/company-permissions.constants";

export interface CompanyJwtPayload {
  sub: string;
  email: string;
  type: "company";
  userId: string;
  companyId: string;
  /** Oturum sürümü — parola değişince artar; eski token'lar geçersizleşir. */
  tv?: number;
  /**
   * "Oturumumu açık bırak" — kayan yenilemede cookie tipini belirler
   * (true/eksik → 30g kalıcı, false → tarayıcı-kapanınca-biten session).
   * AuthCookieInterceptor login'de yazar, slide'da okur.
   */
  persistent?: boolean;
}

export interface AuthenticatedCompanyUser {
  userId: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: CompanyRole[];
  tier: CompanyTier;
  /** INV-KYC-1: para-taahhüdü kapıları için (assertVerified). Her istekte taze. */
  companyVerificationStatus: CompanyVerificationStatus;
  country: string;
  isOwner: boolean;
  permissionsOverride: CompanyPermissionOverride | null;
}

@Injectable()
export class CompanyJwtStrategy extends PassportStrategy(
  Strategy,
  "company-jwt",
) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaBypassService,
  ) {
    super({
      // Önce httpOnly cookie (yeni), geri düşüş Bearer header (geçiş uyumu).
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => readAuthCookie(req, "company"),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(
    payload: CompanyJwtPayload,
  ): Promise<AuthenticatedCompanyUser> {
    if (payload.type !== "company") {
      throw new UnauthorizedException("Geçersiz token tipi");
    }

    // Roller + tier + sahiplik DB'den taze okunur (token'a güvenmeyiz).
    const user = await this.prisma.companyUser.findUnique({
      where: { id: payload.userId },
      // Tam `company` satırı DEĞİL — yalnız kapının kullandığı 7 alan.
      // TEK KAYNAK: AUTH_COMPANY_SELECT (P12 #12; gerekçe orada).
      include: { company: { select: AUTH_COMPANY_SELECT } },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException("Kullanıcı geçersiz");
    }
    if (!user.company.isActive || user.company.isBlocked) {
      throw new UnauthorizedException("Firma hesabı pasif veya engellenmiş");
    }
    // Oturum sürümü: parola değişiminden önce kesilmiş token'lar reddedilir
    // (tv'siz eski token = 0 varsayılır — sürüm hiç artmadıysa geçerli kalır).
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException(
        "Oturum geçersiz — lütfen yeniden giriş yapın",
      );
    }

    // EFEKTİF tier — INV-TIER-1 TEK KAYNAK (effectiveTier): üyelik süresi
    // geçmişse istek boyunca STANDARD, 03:00 cron'unu BEKLEMEZ. Kalıcı downgrade
    // + davet iptali + e-posta scheduler'ın işi (boot catch-up dahil).
    // SAHİPLİK NORMALİZASYONU (tek kaynak: company.ownerUserId): eski/tutarsız
    // veride firma sahibi SAHIP etiketini taşımayabiliyordu (rol dizisi ayrı
    // yazılmış) — bu, portal erişimi/rol düzenleme/etiketleri sessizce
    // kırıyordu. Sahipse SAHIP etiketi HER ZAMAN efektif rollerde bulunur.
    const isOwner = user.company.ownerUserId === user.id;
    const effectiveRoles =
      isOwner && !user.roles.includes("SAHIP")
        ? (["SAHIP", ...user.roles] as typeof user.roles)
        : user.roles;
    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: effectiveRoles,
      tier: effectiveTier(user.company.tier, user.company.membershipEndAt),
      companyVerificationStatus: user.company.companyVerificationStatus,
      country: user.company.country,
      isOwner,
      permissionsOverride:
        (user.permissionsOverride as CompanyPermissionOverride | null) ?? null,
    };
  }
}
