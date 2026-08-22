import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { readAuthCookie } from "../../../common/auth/cookie";

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: string;
  type: "admin";
  /** "Oturumumu açık bırak" — kayan yenilemede cookie tipi (bkz. company). */
  persistent?: boolean;
  /** Oturum sürümü — PlatformAdmin.tokenVersion ile eşleşmeli (iptal kapısı). */
  tv?: number;
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, "admin-jwt") {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaBypassService,
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
      throw new UnauthorizedException("Geçersiz token tipi");
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException("Admin bulunamadı veya pasif");
    }
    // Oturum iptali (denetim 2026-08-23 #3): parola değişimi/reset/2FA
    // değişimi tokenVersion'ı artırır → eski JWT (ve kayan yenilemesi) düşer.
    if ((payload.tv ?? 0) !== admin.tokenVersion) {
      throw new UnauthorizedException("Oturum geçersiz — yeniden giriş yapın");
    }

    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
    };
  }
}
