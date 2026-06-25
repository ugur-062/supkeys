import * as crypto from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailService } from "../email/email.service";

const PASSWORD_RESET_TTL_MINUTES = 60;

type ResetOwner =
  | { userId: string }
  | { supplierUserId: string }
  | { companyUserId: string };

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
  ) {}

  async requestForTenant(rawEmail: string): Promise<{ success: true }> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true },
      select: { id: true, email: true, firstName: true, authId: true },
    });
    if (user?.authId) {
      await this.issue({ userId: user.id }, user.email, user.firstName ?? "");
    }
    return { success: true };
  }

  async requestForSupplier(rawEmail: string): Promise<{ success: true }> {
    const email = rawEmail.trim().toLowerCase();
    const su = await this.prisma.supplierUser.findFirst({
      where: { email, isActive: true },
      select: { id: true, email: true, firstName: true, authId: true },
    });
    if (su?.authId) {
      await this.issue({ supplierUserId: su.id }, su.email, su.firstName ?? "");
    }
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
