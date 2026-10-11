import { i18nMessage } from "../../../common/i18n/http-i18n";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { readAuthCookie } from "../../../common/auth/cookie";
import { SessionRevocationService } from "../../../common/auth/session-revocation.service";

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: string;
  type: "admin";
  /** "Oturumumu açık bırak" — kayan yenilemede cookie tipi (bkz. company). */
  persistent?: boolean;
  /** Oturum sürümü — PlatformAdmin.tokenVersion ile eşleşmeli (iptal kapısı). */
  tv?: number;
  /** Oturum kimliği — çıkışta yalnız bu oturum iptal edilir (bkz. company). */
  jti?: string;
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, "admin-jwt") {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaBypassService,
    private readonly sessions: SessionRevocationService,
  ) {
    super({
      // Önce httpOnly cookie (yeni), geri düşüş Bearer header (geçiş uyumu).
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => readAuthCookie(req, "admin"),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: AdminJwtPayload) {
    if (payload.type !== "admin") {
      throw new UnauthorizedException(i18nMessage("api.adminAuth.gecersizTokenTipi"));
    }

    const [admin, revoked] = await Promise.all([
      this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } }),
      this.sessions.isRevoked(payload.jti),
    ]);
    // Çıkış yapılmış oturum (H2) — yalnız o oturum; öteki cihazlar etkilenmez.
    if (revoked) {
      throw new UnauthorizedException(i18nMessage("api.adminAuth.oturumGecersizYenidenGirisYapin"));
    }

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException(i18nMessage("api.adminAuth.adminBulunamadiVeyaPasif"));
    }
    // Oturum iptali (denetim 2026-08-23 #3): parola değişimi/reset/2FA
    // değişimi tokenVersion'ı artırır → eski JWT (ve kayan yenilemesi) düşer.
    if ((payload.tv ?? 0) !== admin.tokenVersion) {
      throw new UnauthorizedException(i18nMessage("api.adminAuth.oturumGecersizYenidenGirisYapin"));
    }

    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      // AdminRolesGuard 2FA zorunluluğu için (MU-01) — her istekte DB'den taze.
      // Login'in kod istediği koşulla AYNI (etkin + sır var).
      twoFactorEnabled: admin.twoFactorEnabled && !!admin.twoFactorSecret,
      // Geçici parola kapısı (arayüz testi D-025) — AdminRolesGuard okur.
      mustChangePassword: admin.mustChangePassword,
    };
  }
}
