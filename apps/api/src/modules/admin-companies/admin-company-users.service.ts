import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { CompanyRole } from "@rothern/db";
import { SEAT_LIMITS, SEAT_ROLES, permissionsForRoles } from "@rothern/shared";
import { effectiveTier } from "../../common/company/effective-tier";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CompanyAuthService } from "../company-auth/services/company-auth.service";
import { PasswordResetService } from "../password-reset/password-reset.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";

/** Admin'in doğrudan atayabileceği roller — SAHIP devri buradan YAPILMAZ. */
const ASSIGNABLE_ROLES: CompanyRole[] = [
  "YONETICI",
  "SATIN_ALMACI",
  "SATISCI",
  "ONAYLAYICI",
];

/**
 * Admin kullanıcı kurtarma — destek çağrılarının en yoğun konusu: "şifremi
 * unuttum", "doğrulama maili gelmedi", "çalışan ayrıldı, kapatın", "mailim
 * değişti", "yeni üye ekleyin". Her işlem audit'e yazılır.
 */
@Injectable()
export class AdminCompanyUsersService {
  private readonly logger = new Logger(AdminCompanyUsersService.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly audit: AuditService,
    private readonly passwordReset: PasswordResetService,
    private readonly companyAuth: CompanyAuthService,
    private readonly supabase: SupabaseAuthService,
  ) {}

  /** Firma üyeleri — pasif/silinmişler de görünür (destek bağlamı). */
  async list(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { ownerUserId: true },
    });
    if (!company) throw new NotFoundException("Firma bulunamadı");
    const users = await this.prisma.companyUser.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        // phone: bilinçli ÇIKARILDI — SUPPORT dahil tüm rollere açık bu liste
        // yalnız kullanıcı seçimi/e-posta kurtarma için; telefon gereksiz PII.
        roles: true,
        isActive: true,
        emailVerifiedAt: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        deletedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return users.map((u) => ({
      ...u,
      isOwner: u.id === company.ownerUserId,
    }));
  }

  /** Şifre sıfırlama e-postası gönder (mevcut reset akışı — link 30 dk). */
  async sendPasswordReset(companyId: string, userId: string, adminId: string) {
    const user = await this.requireMember(companyId, userId);
    await this.passwordReset.requestForCompany(user.email);
    await this.log("admin.user.password_reset_sent", userId, adminId, {
      email: user.email,
    });
    return { ok: true };
  }

  /** Doğrulama kodunu yeniden gönder — yalnız doğrulanmamış kullanıcıya. */
  async resendVerification(companyId: string, userId: string, adminId: string) {
    await this.requireMember(companyId, userId);
    await this.companyAuth.adminResendVerificationCode(userId);
    await this.log("admin.user.verification_resent", userId, adminId);
    return { ok: true };
  }

  /**
   * Devre dışı bırak / aktifleştir. Pasifleştirme oturumları da düşürür
   * (tokenVersion++) — "çalışan ayrıldı" anında erişim kesilir. Firma sahibi
   * pasifleştirilemez (firma yönetimsiz kalır — önce devir).
   */
  async setActive(
    companyId: string,
    userId: string,
    active: boolean,
    adminId: string,
  ) {
    const user = await this.requireMember(companyId, userId);
    if (user.isOwner && !active) {
      throw new BadRequestException(
        "Firma sahibi devre dışı bırakılamaz — önce sahipliği devredin",
      );
    }
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        isActive: active,
        ...(active ? {} : { tokenVersion: { increment: 1 } }),
      },
    });
    await this.log(
      active ? "admin.user.activated" : "admin.user.deactivated",
      userId,
      adminId,
    );
    return { ok: true };
  }

  /** Oturumları düşür — tokenVersion++ (tüm cihazlarda anında logout). */
  async dropSessions(companyId: string, userId: string, adminId: string) {
    await this.requireMember(companyId, userId);
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.log("admin.user.sessions_dropped", userId, adminId);
    return { ok: true };
  }

  /**
   * E-posta değiştir — "mailim değişti/yanlış yazdım" çağrısı. Supabase
   * auth.users + domain kaydı birlikte güncellenir; oturumlar düşürülür.
   * Admin kimliği telefonda doğruladığı için e-posta doğrulanmış sayılır.
   */
  async changeEmail(
    companyId: string,
    userId: string,
    rawEmail: string,
    adminId: string,
  ) {
    const user = await this.requireMember(companyId, userId);
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Geçerli bir e-posta girin");
    }
    if (email === user.email) {
      throw new BadRequestException("Yeni e-posta mevcutla aynı");
    }
    const clash = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException("Bu e-posta başka bir kullanıcıda kayıtlı");
    }
    // Önce Supabase (login kaynağı) — başarısızsa domain'e dokunma.
    if (user.authId) {
      await this.supabase.updateEmail(user.authId, email);
    }
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        email,
        emailVerifiedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
    await this.log("admin.user.email_changed", userId, adminId, {
      from: user.email,
      to: email,
    });
    return { ok: true, email };
  }

  /**
   * Doğrudan üye ekleme — davet akışını beklemeden admin eliyle hesap açılır;
   * kullanıcıya şifre belirleme (reset) e-postası gider. SAHIP atanamaz.
   */
  async addUser(
    companyId: string,
    input: {
      email: string;
      firstName: string;
      lastName: string;
      role: string;
    },
    adminId: string,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, tier: true, membershipEndAt: true },
    });
    if (!company) throw new NotFoundException("Firma bulunamadı");
    const email = input.email.trim().toLowerCase();
    if (!ASSIGNABLE_ROLES.includes(input.role as CompanyRole)) {
      throw new BadRequestException("Geçersiz rol");
    }
    // Yetki tablosu (Faz 4): admin eliyle açılan koltuk da paket kapısından
    // geçer — eskiden admin limitin üstüne SA/ST ekleyebiliyordu.
    if ((SEAT_ROLES as readonly string[]).includes(input.role)) {
      const limit =
        SEAT_LIMITS[effectiveTier(company.tier, company.membershipEndAt)];
      if (limit != null) {
        const used = await this.prisma.companyUser.count({
          where: {
            companyId,
            deletedAt: null,
            isActive: true,
            roles: { hasSome: [...SEAT_ROLES] as CompanyRole[] },
          },
        });
        if (used + 1 > limit) {
          throw new BadRequestException(
            `Koltuk dolu (${used}/${limit}) — bu rol için firmanın paketi yükseltilmeli`,
          );
        }
      }
    }
    const clash = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException("Bu e-posta ile zaten bir kullanıcı var");
    }
    // Supabase hesabı rastgele parola ile açılır — kullanıcı reset linkiyle
    // kendi parolasını koyar (parola hiçbir yerde loglanmaz/paylaşılmaz).
    const { authId } = await this.supabase.createUser(
      email,
      randomBytes(24).toString("base64url"),
      { role: "company_user" },
    );
    const user = await this.prisma.companyUser.create({
      data: {
        email,
        authId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        roles: [input.role as CompanyRole],
        // Yetki tablosu: rol etiketinin hazır seti açık liste olarak yazılır.
        permissions: permissionsForRoles([input.role]),
        companyId,
        // Admin eliyle açıldı — doğrulama adımı atlanır (kimlik telefonda).
        emailVerifiedAt: new Date(),
        invitedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    await this.passwordReset.requestForCompany(email);
    await this.log("admin.user.created", user.id, adminId, {
      email,
      role: input.role,
      companyId,
    });
    return { ok: true, userId: user.id };
  }

  private async requireMember(companyId: string, userId: string) {
    const user = await this.prisma.companyUser.findFirst({
      where: { id: userId, companyId },
      select: {
        id: true,
        email: true,
        authId: true,
        isActive: true,
        emailVerifiedAt: true,
        company: { select: { ownerUserId: true } },
      },
    });
    if (!user) throw new NotFoundException("Kullanıcı bu firmada bulunamadı");
    return { ...user, isOwner: user.id === user.company.ownerUserId };
  }

  private async log(
    action: string,
    userId: string,
    adminId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      actorType: "admin",
      actorId: adminId,
      entityType: "company_user",
      entityId: userId,
      metadata: metadata ?? null,
    });
  }
}
