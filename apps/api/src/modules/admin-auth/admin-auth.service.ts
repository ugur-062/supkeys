import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { authenticator } from "otplib";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import type { AdminJwtPayload } from "./strategies/admin-jwt.strategy";

const INVALID_CREDENTIALS_MESSAGE = "E-posta veya şifre hatalı";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: AdminLoginDto, ctx?: { ip?: string; userAgent?: string }) {
    const email = dto.email.toLowerCase();
    const auditFail = (reason: string) =>
      void this.audit.log({
        action: "auth.login_failed",
        actorType: "admin",
        actorEmail: email,
        metadata: { reason, portal: "admin" },
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      });

    // Supabase Auth source-of-truth. verifyPassword başarısızsa generic 401.
    let authId: string;
    try {
      const result = await this.supabaseAuth.verifyPassword(email, dto.password);
      authId = result.authId;
    } catch {
      auditFail("bad_credentials");
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { authId },
    });

    if (!admin || !admin.isActive) {
      auditFail("inactive_or_missing");
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // 2FA (TOTP) — etkinse parola YETMEZ: kod ister; frontend bu mesajı
    // yakalayıp kod alanını gösterir ve isteği code ile tekrarlar.
    if (admin.twoFactorEnabled && admin.twoFactorSecret) {
      if (!dto.code) {
        throw new UnauthorizedException("2FA_REQUIRED");
      }
      const ok = authenticator.verify({
        token: dto.code.trim(),
        secret: admin.twoFactorSecret,
      });
      if (!ok) {
        auditFail("bad_2fa_code");
        throw new UnauthorizedException("Doğrulama kodu hatalı");
      }
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: "admin",
    };

    void this.audit.log({
      action: "auth.login",
      actorType: "admin",
      actorId: admin.id,
      actorEmail: admin.email,
      metadata: { portal: "admin", role: admin.role },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return {
      token: this.jwt.sign(payload),
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      },
    };
  }

  async getMe(adminId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });
    if (!admin) {
      throw new UnauthorizedException();
    }
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      twoFactorEnabled: admin.twoFactorEnabled,
    };
  }

  // ── Hesap güvenliği (Faz 7) ─────────────────────────────────

  /** Şifre değiştir — mevcut şifre Supabase'te doğrulanır. */
  async changePassword(adminId: string, current: string, next: string) {
    const admin = await this.requireAdmin(adminId);
    if (next.length < 12) {
      throw new BadRequestException("Yeni şifre en az 12 karakter olmalı");
    }
    try {
      await this.supabaseAuth.verifyPassword(admin.email, current);
    } catch {
      throw new BadRequestException("Mevcut şifre hatalı");
    }
    if (!admin.authId) {
      throw new BadRequestException("Hesap Supabase köprüsüne bağlı değil");
    }
    await this.supabaseAuth.updatePassword(admin.authId, next);
    await this.audit.log({
      action: "admin.self.password_changed",
      actorType: "admin",
      actorId: adminId,
      actorEmail: admin.email,
    });
    return { ok: true };
  }

  /** 2FA kurulum — secret + otpauth URI döner (enable'da kodla doğrulanır). */
  async setupTwoFactor(adminId: string) {
    const admin = await this.requireAdmin(adminId);
    if (admin.twoFactorEnabled) {
      throw new BadRequestException("2FA zaten etkin");
    }
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(admin.email, "Rothern Admin", secret);
    return { secret, otpauthUrl };
  }

  /** 2FA etkinleştir — setup'taki secret + authenticator kodu doğrulanır. */
  async enableTwoFactor(adminId: string, secret: string, code: string) {
    const admin = await this.requireAdmin(adminId);
    if (admin.twoFactorEnabled) {
      throw new BadRequestException("2FA zaten etkin");
    }
    if (!authenticator.verify({ token: code.trim(), secret })) {
      throw new BadRequestException("Doğrulama kodu hatalı");
    }
    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: { twoFactorEnabled: true, twoFactorSecret: secret },
    });
    await this.audit.log({
      action: "admin.self.2fa_enabled",
      actorType: "admin",
      actorId: adminId,
      actorEmail: admin.email,
    });
    return { ok: true };
  }

  /** 2FA kapat — mevcut kod şart (çalıntı oturum tek başına kapatamasın). */
  async disableTwoFactor(adminId: string, code: string) {
    const admin = await this.requireAdmin(adminId);
    if (!admin.twoFactorEnabled || !admin.twoFactorSecret) {
      throw new BadRequestException("2FA etkin değil");
    }
    if (!authenticator.verify({ token: code.trim(), secret: admin.twoFactorSecret })) {
      throw new BadRequestException("Doğrulama kodu hatalı");
    }
    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await this.audit.log({
      action: "admin.self.2fa_disabled",
      actorType: "admin",
      actorId: adminId,
      actorEmail: admin.email,
    });
    return { ok: true };
  }

  private async requireAdmin(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!admin || !admin.isActive) throw new UnauthorizedException();
    return admin;
  }
}
