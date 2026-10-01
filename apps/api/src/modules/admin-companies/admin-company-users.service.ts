import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { CompanyRole, Prisma } from "@rothern/db";
import { isValidEmailLike, permissionsForRoles, seatGroupsOf } from "@rothern/shared";
import { assertSeatAvailable, lockCompanyRow } from "../../common/company/seat-gate";
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
    if (!company) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
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

  /** Şifre sıfırlama e-postası gönder (mevcut reset akışı — link 60 dk). */
  async sendPasswordReset(companyId: string, userId: string, adminId: string) {
    const user = await this.requireMember(companyId, userId);
    await this.passwordReset.requestForCompany(user.email);
    await this.log(companyId, "admin.user.password_reset_sent", userId, adminId, {
      email: user.email,
    });
    return { ok: true };
  }

  /**
   * Doğrulama kodunu yeniden gönder — yalnız doğrulanmamış kullanıcıya.
   * Saatlik kod tavanı doluysa 429, gönderim başarısızsa 503 fırlar (arayüz
   * testi O-064: eskiden sonuç atılıp her durumda "gönderildi" + audit
   * yazılıyordu, e-posta gitmiyordu). Audit YALNIZ başarıda yazılır.
   */
  async resendVerification(companyId: string, userId: string, adminId: string) {
    await this.requireMember(companyId, userId);
    await this.companyAuth.adminResendVerificationCode(userId);
    await this.log(companyId, "admin.user.verification_resent", userId, adminId);
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
        i18nMessage("api.adminCompanies.firmaSahibiDevreDisiBirakilamazOnce"),
      );
    }
    // Derin denetim MU-04: koltuk taşıyan pasif kişinin reaktivasyonu koltuğunu
    // yeniden tüketir — firma panelindeki reaktivasyonla AYNI kapı (paket limiti
    // + satınalma yalnız GOLD), firma satırı kilitli tx'te. Eskiden admin
    // "Aktifleştir" 4/4 dolu firmada 5/4 açabiliyordu.
    const seatGroups = seatGroupsOf({
      isOwner: user.isOwner,
      permissions: user.permissions,
      roles: user.roles,
    });
    if (active && !user.isActive && !user.deletedAt && seatGroups.size > 0) {
      await this.prisma.$transaction(async (tx) => {
        await lockCompanyRow(tx, companyId);
        await assertSeatAvailable(tx, companyId, {
          groups: seatGroups,
          context: "assign",
        });
        await tx.companyUser.update({
          where: { id: userId },
          data: { isActive: true },
        });
      });
    } else {
      await this.prisma.companyUser.update({
        where: { id: userId },
        data: {
          isActive: active,
          ...(active ? {} : { tokenVersion: { increment: 1 } }),
        },
      });
    }
    await this.log(
      companyId,
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
    await this.log(companyId, "admin.user.sessions_dropped", userId, adminId);
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
    if (!isValidEmailLike(email)) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.gecerliBirEPostaGirin"));
    }
    if (email === user.email) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.yeniEPostaMevcutlaAyni"));
    }
    const clash = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(i18nMessage("api.adminCompanies.buEPostaBaskaBirKullanicida"));
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
    await this.log(companyId, "admin.user.email_changed", userId, adminId, {
      from: user.email,
      to: email,
    });
    return { ok: true, email };
  }

  /**
   * Doğrudan üye ekleme — davet akışını beklemeden admin eliyle hesap açılır;
   * kullanıcıya "hesabınız açıldı, şifrenizi belirleyin" e-postası gider.
   * SAHIP atanamaz.
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
      select: { id: true },
    });
    if (!company) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    const email = input.email.trim().toLowerCase();
    if (!ASSIGNABLE_ROLES.includes(input.role as CompanyRole)) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.gecersizRol"));
    }
    const permissions = permissionsForRoles([input.role]);
    // Yetki tablosu (Faz 4) + derin denetim MU-04: admin eliyle açılan koltuk
    // firma panelindeki kapının AYNISINDAN geçer — (kişi, grup) sayımı, bekleyen
    // koltuk davetleri dahil (aksi halde onlar kabulde "koltuk dolu" kalır) ve
    // SATINALMA YALNIZ GOLD (2026-09-14). Burada kilitsiz ön kontrol (Supabase
    // hesabı boşuna açılmasın); asıl kapı aşağıda kilitli tx'te tekrar koşar.
    const seatGroups = seatGroupsOf({ permissions });
    const seatGate = (db: Prisma.TransactionClient) =>
      assertSeatAvailable(db, companyId, {
        groups: seatGroups,
        includePending: true,
        context: "assign",
      });
    await seatGate(this.prisma);
    const clash = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(i18nMessage("api.adminCompanies.buEPostaIleZatenBir"));
    }
    // Supabase hesabı rastgele parola ile açılır — kullanıcı reset linkiyle
    // kendi parolasını koyar (parola hiçbir yerde loglanmaz/paylaşılmaz).
    const { authId } = await this.supabase.createUser(
      email,
      randomBytes(24).toString("base64url"),
      { role: "company_user" },
    );
    let user: { id: string; email: string };
    try {
      user = await this.prisma.$transaction(async (tx) => {
        await lockCompanyRow(tx, companyId);
        await seatGate(tx);
        return tx.companyUser.create({
          data: {
            email,
            authId,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            roles: [input.role as CompanyRole],
            // Yetki tablosu: rol etiketinin hazır seti açık liste olarak yazılır.
            permissions,
            companyId,
            // Admin eliyle açıldı — doğrulama adımı atlanır (kimlik telefonda).
            emailVerifiedAt: new Date(),
            invitedAt: new Date(),
          },
          select: { id: true, email: true },
        });
      });
    } catch (err) {
      // Kilitli kapı (yarış) ya da yazım düştü — yetim Supabase hesabı kalmasın.
      await this.supabase.deleteUser(authId).catch((e: unknown) => {
        this.logger.warn(
          `addUser rollback: orphan auth user could not be deleted (${authId}): ${String(e)}`,
        );
      });
      throw err;
    }
    // Sıfırlama değil "hesabınız açıldı, şifrenizi belirleyin" e-postası
    // (arayüz testi O-124) — firma adıyla, 72 saat geçerli bağlantı.
    const { sent } = await this.passwordReset.requestAccountSetup(user.id);
    await this.log(companyId, "admin.user.created", user.id, adminId, {
      email,
      role: input.role,
      companyId,
      setupEmailSent: sent,
    });
    return { ok: true, userId: user.id, emailSent: sent };
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
        deletedAt: true,
        roles: true,
        permissions: true,
        company: { select: { ownerUserId: true } },
      },
    });
    if (!user) throw new NotFoundException(i18nMessage("api.adminCompanies.kullaniciBuFirmadaBulunamadi"));
    return { ...user, isOwner: user.id === user.company.ownerUserId };
  }

  /**
   * `tenantId` = firma (arayüz testi D-205): firma detayındaki Denetim sekmesi
   * kullanıcı işlemlerini firma kimliğiyle bulur (entityId kullanıcıdır).
   */
  private async log(
    companyId: string,
    action: string,
    userId: string,
    adminId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      actorType: "admin",
      actorId: adminId,
      tenantId: companyId,
      entityType: "company_user",
      entityId: userId,
      metadata: metadata ?? null,
    });
  }
}
