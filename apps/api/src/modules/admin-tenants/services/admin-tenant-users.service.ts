import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { Prisma, type UserRole } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EmailService } from "../../email/email.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { TenantUsersService } from "../../tenant-users/services/tenant-users.service";
import { AdminUpdateTenantUserDto } from "../dto/admin-update-tenant-user.dto";

const PASSWORD_RESET_TTL_MINUTES = 60;

@Injectable()
export class AdminTenantUsersService {
  private readonly logger = new Logger(AdminTenantUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly tenantUsers: TenantUsersService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
  ) {}

  private auditUser(
    adminId: string,
    action: string,
    tenantId: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    void this.audit.log({
      action,
      actorType: "admin",
      actorId: adminId || null,
      tenantId,
      entityType: "user",
      entityId: userId,
      metadata,
    });
  }

  // ----- PATCH user (isActive + role) -----

  async updateUser(
    tenantId: string,
    userId: string,
    dto: AdminUpdateTenantUserDto,
    adminId: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true, isActive: true },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    // Son aktif COMPANY_ADMIN'i pasifleştiremez veya demote edemez
    if (target.role === "COMPANY_ADMIN") {
      const wouldDeactivate = dto.isActive === false;
      const wouldDemote =
        dto.role !== undefined && dto.role !== "COMPANY_ADMIN";
      if (wouldDeactivate || wouldDemote) {
        const others = await this.prisma.user.count({
          where: {
            tenantId,
            role: "COMPANY_ADMIN",
            isActive: true,
            id: { not: userId },
          },
        });
        if (others === 0) {
          throw new ConflictException(
            "En az bir aktif Yönetici olmak zorunda",
          );
        }
      }
    }

    // BUYER kontenjan kontrolü (rol BUYER'a yükseltiliyorsa)
    if (
      dto.role === "BUYER" &&
      target.role !== "BUYER" &&
      dto.isActive !== false
    ) {
      const usage = await this.tenantUsers.getBuyerSeatUsage(tenantId, {
        excludeUserId: userId,
      });
      if (usage.used >= usage.limit) {
        throw new ConflictException(
          `Satın Almacı kontenjanı dolu (${usage.used}/${usage.limit}).`,
        );
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;

    if (Object.keys(data).length === 0) {
      return { id: userId, updated: false };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
    this.logger.log(
      `Admin ${adminId} updated tenant user ${userId} (${tenantId}): ${JSON.stringify(data)}`,
    );
    this.auditUser(adminId, "tenant.user_updated", tenantId, userId, {
      fields: Object.keys(data),
      role: dto.role,
      isActive: dto.isActive,
    });
    return updated;
  }

  // ----- KVKK silme (anonimleştir + auth sil) -----

  /**
   * Admin KVKK silme talebi — kullanıcıyı anonimleştirir (deletedAt, e-posta +
   * isim maskeleme), Supabase auth kaydını siler. Tender/Order referansları
   * korunur. Son aktif COMPANY_ADMIN silinemez.
   */
  async deleteUser(tenantId: string, userId: string, adminId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: { id: true, role: true, authId: true, email: true },
    });
    if (!target) throw new NotFoundException("Kullanıcı bulunamadı");

    if (target.role === "COMPANY_ADMIN") {
      const others = await this.prisma.user.count({
        where: {
          tenantId,
          role: "COMPANY_ADMIN",
          isActive: true,
          deletedAt: null,
          id: { not: userId },
        },
      });
      if (others === 0) {
        throw new ConflictException("En az bir aktif Yönetici olmak zorunda");
      }
    }

    if (target.authId) {
      await this.supabaseAuth.deleteUser(target.authId).catch(() => undefined);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        authId: null,
        email: `deleted-${userId}@supkeys.local`,
        firstName: "Silinmiş",
        lastName: "Kullanıcı",
        phone: null,
      },
    });
    this.auditUser(adminId, "tenant.user_deleted", tenantId, userId, {
      previousEmail: target.email,
    });
    this.logger.log(`Admin ${adminId} KVKK-deleted user ${userId} (${tenantId})`);
    return { success: true };
  }

  // ----- Hesap kurtarma (admin destek) -----

  /** E-postayı zorla doğrula (kullanıcı kodu alamıyorsa). */
  async forceVerifyEmail(tenantId: string, userId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, emailVerifiedAt: true },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    if (target.emailVerifiedAt) return { success: true, alreadyVerified: true };
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    this.logger.log(`Admin ${adminId} force-verified user ${userId}`);
    this.auditUser(adminId, "tenant.user_email_verified", tenantId, userId);
    return { success: true };
  }

  /** 2FA'yı sıfırla/kapat (kullanıcı 2FA'ya kilitlendiyse). */
  async reset2FA(tenantId: string, userId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorEnabledAt: null },
    });
    this.logger.log(`Admin ${adminId} reset 2FA for user ${userId}`);
    this.auditUser(adminId, "tenant.user_2fa_reset", tenantId, userId);
    return { success: true };
  }

  /** E-posta adresini değiştir (Supabase Auth + domain, doğrulanmış sayılır). */
  async changeEmail(
    tenantId: string,
    userId: string,
    newEmailRaw: string,
    adminId: string,
  ) {
    const email = newEmailRaw.toLowerCase().trim();
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, email: true, authId: true },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    if (target.email === email) return { success: true, updated: false };
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Bu e-posta zaten kullanımda");
    if (!target.authId) {
      throw new BadRequestException(
        "Bu hesap Supabase Auth'a bağlı değil — destek ekibiyle iletişime geçin",
      );
    }
    await this.supabaseAuth.updateEmail(target.authId, email);
    await this.prisma.user.update({
      where: { id: userId },
      data: { email, emailVerifiedAt: new Date() },
    });
    this.logger.log(
      `Admin ${adminId} changed email for user ${userId} → ${email}`,
    );
    this.auditUser(adminId, "tenant.user_email_changed", tenantId, userId, {
      newEmail: email,
    });
    return { success: true, email };
  }

  // ----- Davet iptal (admin override) -----

  async cancelInvitation(tenantId: string, invitationId: string, adminId: string) {
    const inv = await this.prisma.userInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!inv || inv.tenantId !== tenantId) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (inv.status !== "PENDING") {
      throw new ConflictException("Sadece bekleyen davetler iptal edilebilir");
    }
    await this.prisma.userInvitation.update({
      where: { id: invitationId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    this.logger.log(
      `Admin ${adminId} cancelled invitation ${invitationId} (${tenantId})`,
    );
    this.auditUser(adminId, "tenant.invitation_cancelled", tenantId, invitationId);
    return { success: true };
  }

  /** Bekleyen kullanıcı davetini yeniden gönder (admin destek). */
  async resendInvitation(
    tenantId: string,
    invitationId: string,
    adminId: string,
  ) {
    const inv = await this.prisma.userInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!inv || inv.tenantId !== tenantId) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (inv.status !== "PENDING") {
      throw new ConflictException("Sadece bekleyen davetler yeniden gönderilebilir");
    }
    const result = await this.tenantUsers.resendInvitation(
      tenantId,
      invitationId,
    );
    this.auditUser(
      adminId,
      "tenant.invitation_resent",
      tenantId,
      invitationId,
    );
    this.logger.log(
      `Admin ${adminId} resent invitation ${invitationId} (${tenantId})`,
    );
    return result;
  }

  // ----- Parola sıfırlama linki üret + e-posta -----

  async issuePasswordReset(tenantId: string, userId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        email: true,
        firstName: true,
        isActive: true,
        tenant: { select: { isActive: true } },
      },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    if (!target.isActive || !target.tenant.isActive) {
      throw new BadRequestException(
        "Pasif kullanıcı veya pasif tenant için parola sıfırlanamaz",
      );
    }

    // Mevcut kullanılmamış token varsa sil (tek aktif token politikası)
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null },
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
      data: {
        userId,
        tokenHash,
        expiresAt,
        createdByAdminId: adminId,
      },
    });

    const baseUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${plainToken}`;

    try {
      await this.emailService.send({
        to: { email: target.email, name: target.firstName },
        templateData: {
          template: "admin_password_reset",
          data: {
            firstName: target.firstName,
            email: target.email,
            resetUrl,
            expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
          },
        },
      });
    } catch (err) {
      this.logger.error(
        `Password reset email enqueue failed for ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this.logger.log(
      `Admin ${adminId} issued password reset for user ${userId} (${target.email})`,
    );
    this.auditUser(adminId, "tenant.user_password_reset", tenantId, userId);

    return {
      success: true,
      email: target.email,
      expiresAt,
      // Admin destek senaryosu: link admin paneline de döner ki müşteriye
      // manuel iletilebilsin (e-posta varmadıysa yedek).
      resetUrl,
    };
  }

  // ----- Reset confirm (public) — token + yeni şifre -----

  async confirmPasswordReset(plainToken: string, newPassword: string) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, isActive: true, authId: true } },
        supplierUser: { select: { id: true, isActive: true, authId: true } },
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
    // Hedef alıcı (User), tedarikçi (SupplierUser) veya firma (CompanyUser) olabilir.
    const target = record.user ?? record.supplierUser ?? record.companyUser;
    if (!target) {
      throw new ForbiddenException("Geçersiz bağlantı");
    }
    if (!target.isActive) {
      throw new ForbiddenException("Hesap pasif");
    }
    if (!target.authId) {
      throw new ForbiddenException(
        "Bu hesap Supabase Auth'a bağlı değil — destek ekibiyle iletişime geçin",
      );
    }

    // Supabase Auth source-of-truth: şifreyi auth.users üzerinde güncelle,
    // token'ı kullanıldı olarak işaretle. updatePassword $transaction dışı
    // olsa da idempotent — DB tx fail olsa bile yeniden çalıştırılabilir.
    await this.supabaseAuth.updatePassword(target.authId, newPassword);
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return { success: true };
  }
}
