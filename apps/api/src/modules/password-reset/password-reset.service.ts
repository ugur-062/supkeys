import * as crypto from "node:crypto";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";

const PASSWORD_RESET_TTL_MINUTES = 60;

type ResetOwner = { companyUserId: string };

/**
 * Self-service "şifremi unuttum" — kullanıcının kendi talebiyle token üretip
 * e-posta gönderir. Admin-initiated reset ile AYNI token sistemi: bizim token +
 * /reset-password?token= sayfası + POST /auth/password-reset/confirm.
 *
 * Kullanıcı sayımı (enumeration) sızdırmaz: e-posta bulunmasa bile generic
 * { success: true } döner.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  /**
   * Public confirm — /reset-password sayfasından gelen token + yeni parola.
   * Supabase Auth source-of-truth: parolayı auth.users üzerinde günceller.
   */
  async confirmPasswordReset(plainToken: string, newPassword: string) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        companyUser: { select: { id: true, isActive: true, authId: true } },
      },
    });
    if (!record) {
      throw new ForbiddenException("Geçersiz veya kullanılmış bağlantı");
    }
    if (record.usedAt) {
      throw new ForbiddenException("Bu bağlantı zaten kullanılmış");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException("Bağlantının süresi dolmuş");
    }
    const target = record.companyUser;
    if (!target || !target.isActive) {
      throw new ForbiddenException("Hesap geçersiz veya pasif");
    }
    if (!target.authId) {
      throw new ForbiddenException(
        "Bu hesap Supabase Auth'a bağlı değil — destek ekibiyle iletişime geçin",
      );
    }

    // Token'ı ATOMİK tüket (tek-kullanım yarış koruması) — parolayı GÜNCELLEMEDEN
    // önce. İki eşzamanlı confirm'de yalnız biri count=1 alır; diğeri count=0 →
    // "zaten kullanılmış". Böylece parola ikinci kez (farklı değerle) set edilemez.
    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ForbiddenException("Bu bağlantı zaten kullanılmış");
    }
    await this.supabaseAuth.updatePassword(target.authId, newPassword);
    // Tüm mevcut oturumlar geçersizleşir (tokenVersion) — parola sıfırlama
    // genelde hesabın ele geçirilme şüphesinde yapılır.
    await this.prisma.companyUser.update({
      where: { id: target.id },
      data: { tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }

  async requestForCompany(rawEmail: string): Promise<{ success: true }> {
    const email = rawEmail.trim().toLowerCase();
    const cu = await this.prisma.companyUser.findFirst({
      where: { email, isActive: true, deletedAt: null },
      select: { id: true, email: true, firstName: true, authId: true },
    });
    if (cu?.authId) {
      await this.issue({ companyUserId: cu.id }, cu.email, cu.firstName ?? "");
    }
    return { success: true };
  }

  private async issue(
    owner: ResetOwner,
    email: string,
    firstName: string,
  ): Promise<void> {
    // Tek aktif token politikası — bu kullanıcının kullanılmamış token'larını sil.
    await this.prisma.passwordResetToken.deleteMany({
      where: { ...owner, usedAt: null },
    });

    const plainToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.passwordResetToken.create({
      data: { ...owner, tokenHash, expiresAt },
    });

    const baseUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${plainToken}`;

    try {
      await this.email.send({
        to: { email, name: firstName || email },
        templateData: {
          template: "password_reset",
          data: {
            firstName: firstName || email,
            email,
            resetUrl,
            expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
          },
        },
        context: { type: "password_reset", id: email },
      });
    } catch (err) {
      this.logger.error(
        `Parola sıfırlama e-postası gönderilemedi (${email}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
