import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { localizeAppPath } from "../../common/company/app-routes";
import { localeOf } from "../notifications/notification.service";
import { i18nMessage } from "../../common/i18n/http-i18n";
import { tApi, type ApiMessageKey } from "../../common/i18n/i18n.service";
import * as crypto from "node:crypto";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import { resolveWebUrl } from "../../common/config/web-url";
import { maskEmail } from "../../common/logging/mask-email";

const PASSWORD_RESET_TTL_MINUTES = 60;
/**
 * Admin eliyle açılan hesabın "şifrenizi belirleyin" bağlantısı (arayüz testi
 * O-124): yeni üye e-postayı hemen görmeyebilir — 60 dk'lık sıfırlama süresi
 * yerine 72 saat. Aynı token sistemi, aynı /reset-password sayfası.
 */
const ACCOUNT_SETUP_TTL_HOURS = 72;

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
      throw new ForbiddenException(i18nMessage("api.passwordReset.gecersizVeyaKullanilmisBaglanti"));
    }
    if (record.usedAt) {
      throw new ForbiddenException(i18nMessage("api.passwordReset.buBaglantiZatenKullanilmis"));
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException(i18nMessage("api.passwordReset.baglantininSuresiDolmus"));
    }
    const target = record.companyUser;
    if (!target || !target.isActive) {
      throw new ForbiddenException(i18nMessage("api.passwordReset.hesapGecersizVeyaPasif"));
    }
    if (!target.authId) {
      throw new ForbiddenException(
        i18nMessage("api.passwordReset.buHesapSupabaseAuthABagli"),
      );
    }

    // Token'ı ATOMİK tüket (tek-kullanım yarış koruması) — parolayı GÜNCELLEMEDEN
    // önce. İki eşzamanlı confirm'de yalnız biri count=1 alır; diğeri count=0 →
    // "zaten kullanılmış". Böylece parola ikinci kez (farklı değerle) set edilemez.
    const claimedAt = new Date();
    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: claimedAt },
    });
    if (claimed.count === 0) {
      throw new ForbiddenException(i18nMessage("api.passwordReset.buBaglantiZatenKullanilmis"));
    }
    try {
      await this.supabaseAuth.updatePassword(target.authId, newPassword);
    } catch (err) {
      // Derin denetim X17: parola güncellenemediyse (zayıf/sızmış parola 400,
      // Supabase kesintisi 503) bağlantı YANMAZ — kullanıcı aynı linkle başka
      // bir parola deneyebilir. Yalnız bu çağrının koyduğu damga geri alınır.
      await this.prisma.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: claimedAt },
        data: { usedAt: null },
      });
      throw err;
    }
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
      select: {
        id: true,
        email: true,
        firstName: true,
        authId: true,
        locale: true,
      },
    });
    if (cu?.authId) {
      await this.issue(
        { companyUserId: cu.id },
        cu.email,
        cu.firstName ?? "",
        localeOf(cu.locale),
      );
    }
    return { success: true };
  }

  /**
   * Admin'in doğrudan eklediği üyeye "hesabınız açıldı, şifrenizi belirleyin"
   * e-postası (arayüz testi O-124). Eskiden şifre sıfırlama e-postası gidiyordu
   * ("sıfırlama talebinde bulundunuz … siz yapmadıysanız yok sayın") — yeni
   * üyeyi e-postayı yok saymaya yönlendiriyordu. Firma adıyla, 72 saat geçerli.
   * Gönderim sonucu döner (çağıran yanıtına yazabilir); hata yutulur, loglanır.
   */
  async requestAccountSetup(companyUserId: string): Promise<{ sent: boolean }> {
    const cu = await this.prisma.companyUser.findFirst({
      where: { id: companyUserId, isActive: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        authId: true,
        locale: true,
        company: { select: { name: true } },
      },
    });
    if (!cu?.authId) return { sent: false };
    const locale = localeOf(cu.locale);
    const resetUrl = await this.createTokenUrl(
      { companyUserId: cu.id },
      ACCOUNT_SETUP_TTL_HOURS * 60,
      locale,
    );
    const t = (key: ApiMessageKey, values?: Record<string, string | number>) =>
      tApi(key, values, locale);
    const company = cu.company.name;
    const subject = t("api.notifications.companyUsers.accountSetup.subject", { company });
    try {
      const res = await this.email.send({
        to: { email: cu.email, name: cu.firstName || cu.email },
        locale,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: t("api.notifications.companyUsers.accountSetup.heading"),
            paragraphs: [
              t("api.notifications.common.greeting"),
              t("api.notifications.companyUsers.accountSetup.intro", { company }),
              t("api.notifications.companyUsers.accountSetup.setPassword"),
            ],
            infoRows: [
              {
                label: t("api.notifications.companyUsers.invite.rowCompany"),
                value: company,
              },
              {
                label: t("api.notifications.companyUsers.accountSetup.rowAccount"),
                value: cu.email,
              },
              {
                label: t("api.notifications.companyUsers.invite.rowValidity"),
                value: t("api.notifications.companyUsers.accountSetup.validityHours", {
                  hours: ACCOUNT_SETUP_TTL_HOURS,
                }),
              },
            ],
            ctaLabel: t("api.notifications.companyUsers.accountSetup.cta"),
            ctaUrl: resetUrl,
            footerNote: t("api.notifications.companyUsers.accountSetup.footer"),
          },
        },
        // Aynı tek-kullanımlık sır sınıfı: kritik (Sentry) + payload maskeli.
        context: { type: "password_reset", id: cu.id },
      });
      return { sent: res.sent };
    } catch (err) {
      this.logger.error(
        `Account setup email could not be sent (${maskEmail(cu.email)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { sent: false };
    }
  }

  /** Tek aktif token politikası + yeni token; dil ön ekli bağlantıyı döner. */
  private async createTokenUrl(
    owner: ResetOwner,
    ttlMinutes: number,
    locale: Locale,
  ): Promise<string> {
    // Tek aktif token politikası — bu kullanıcının kullanılmamış token'larını sil.
    await this.prisma.passwordResetToken.deleteMany({
      where: { ...owner, usedAt: null },
    });

    const plainToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { ...owner, tokenHash, expiresAt },
    });

    const baseUrl = (
      resolveWebUrl(this.config)
    ).replace(/\/$/, "");
    return `${baseUrl}${localizeAppPath(`/reset-password?token=${plainToken}`, locale)}`;
  }

  private async issue(
    owner: ResetOwner,
    email: string,
    firstName: string,
    // Alıcı KAYITLI bir kullanıcı: e-posta ve bağlantı onun dilinde üretilir.
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<void> {
    const resetUrl = await this.createTokenUrl(
      owner,
      PASSWORD_RESET_TTL_MINUTES,
      locale,
    );

    try {
      await this.email.send({
        to: { email, name: firstName || email },
        locale,
        templateData: {
          template: "password_reset",
          data: {
            firstName: firstName || email,
            email,
            resetUrl,
            expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
          },
        },
        // Kimlik = kullanıcı id'si, adres DEĞİL: bağlam kimliği EmailLog'a ve
        // kritik gönderim/bastırma alarmında Sentry `extra.contextId`e düşer
        // (derin denetim 2026-09-29 X09 — "PII yok" sözü).
        context: { type: "password_reset", id: owner.companyUserId },
      });
    } catch (err) {
      this.logger.error(
        `Parola sıfırlama e-postası gönderilemedi (${maskEmail(email)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
