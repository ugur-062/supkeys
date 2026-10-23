import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { localizeAppPath } from "../../common/company/app-routes";
import { localeOf } from "../notifications/notification.service";
import { i18nMessage } from "../../common/i18n/http-i18n";
import { tApi, type ApiMessageKey } from "../../common/i18n/i18n.service";
import * as crypto from "node:crypto";
import { ForbiddenException, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
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

/** Kapanışta arkadaki sıfırlama işleri için en fazla bekleme. */
const BACKGROUND_SHUTDOWN_WAIT_MS = 10_000;

type ResetOwner = { companyUserId: string };

/** Bağlantının reddedilme nedeni — confirm'ün 403 metni, check'in `message`ı. */
type ResetTokenRejection =
  | "api.passwordReset.gecersizVeyaKullanilmisBaglanti"
  | "api.passwordReset.buBaglantiZatenKullanilmis"
  | "api.passwordReset.baglantininSuresiDolmus"
  | "api.passwordReset.hesapGecersizVeyaPasif"
  | "api.passwordReset.buHesapSupabaseAuthABagli";

/**
 * Self-service "şifremi unuttum" — kullanıcının kendi talebiyle token üretip
 * e-posta gönderir. Admin-initiated reset ile AYNI token sistemi: bizim token +
 * /reset-password?token= sayfası + POST /auth/password-reset/confirm.
 *
 * Kullanıcı sayımı (enumeration) sızdırmaz: e-posta bulunmasa bile generic
 * { success: true } döner.
 */
@Injectable()
export class PasswordResetService implements OnModuleDestroy {
  private readonly logger = new Logger(PasswordResetService.name);
  /** Yanıttan SONRA süren işler (bkz. `requestForCompanyInBackground`). */
  private readonly background = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  /**
   * Bağlantı kuralları — TEK yer. `confirmPasswordReset` (yazar) ve
   * `checkResetToken` (yalnız okur) aynı kararı buradan alır: bilinmeyen
   * (yenisiyle değiştirilen bağlantı da budur — eski kullanılmamış token
   * silinir), kullanılmış, süresi dolmuş, hesabı pasif/bağsız → geçersiz.
   * Hiçbir şey YAZMAZ.
   */
  private async resolveResetToken(plainToken: string) {
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
    const reject = (reason: ResetTokenRejection) => ({ ok: false as const, reason });
    if (!record) return reject("api.passwordReset.gecersizVeyaKullanilmisBaglanti");
    if (record.usedAt) return reject("api.passwordReset.buBaglantiZatenKullanilmis");
    if (record.expiresAt.getTime() < Date.now()) {
      return reject("api.passwordReset.baglantininSuresiDolmus");
    }
    const target = record.companyUser;
    if (!target || !target.isActive) return reject("api.passwordReset.hesapGecersizVeyaPasif");
    if (!target.authId) return reject("api.passwordReset.buHesapSupabaseAuthABagli");
    return { ok: true as const, record, target: { id: target.id, authId: target.authId } };
  }

  /**
   * Bağlantı hâlâ kullanılabilir mi — SALT OKUMA (arayüz testi 2026-10
   * login-16). /reset-password sayfası açılırken sorar: kullanılmış ya da
   * yenisiyle değiştirilmiş bağlantıda form yerine "geçersiz bağlantı" kartı
   * hemen çizilir (eskiden kullanıcı bunu yeni şifreyi iki kez yazıp
   * gönderdikten sonra öğreniyordu). Token tüketilmez, hiçbir şey yazılmaz;
   * geçersizse neden confirm'ün vereceği metinle aynıdır.
   */
  async checkResetToken(plainToken: string): Promise<{ valid: boolean; message?: string }> {
    const resolved = await this.resolveResetToken(plainToken);
    if (resolved.ok) return { valid: true };
    return { valid: false, message: tApi(resolved.reason) };
  }

  /**
   * Public confirm — /reset-password sayfasından gelen token + yeni parola.
   * Supabase Auth source-of-truth: parolayı auth.users üzerinde günceller.
   */
  async confirmPasswordReset(plainToken: string, newPassword: string) {
    const resolved = await this.resolveResetToken(plainToken);
    if (!resolved.ok) throw new ForbiddenException(i18nMessage(resolved.reason));
    const { record, target } = resolved;

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

  /**
   * Herkese açık "şifremi unuttum" ucu için: yanıt adresin kayıtlı olup
   * olmadığını METNİYLE de SÜRESİYLE de söylemez (arayüz testi 2026-10
   * login-14). Eskiden kayıtlı adreste token + e-posta işi yanıttan ÖNCE
   * bekleniyordu (yerelde ~75 ms'ye karşı ~13 ms; gerçek e-posta sağlayıcısıyla
   * fark büyür) — süre ölçen biri hangi adresin kayıtlı olduğunu görüyordu.
   *
   * Yanıt HEMEN döner; arama, token ve e-posta işi arkada sürer. Hata
   * kullanıcıya dönemez (yanıt çoktan gitti) → adres maskeli olarak loglanır.
   * Süren işler `whenIdle()` ile beklenebilir: süreç kapanırken yarım kalmasın
   * diye (`onModuleDestroy`) ve testler arkada yazım bırakmasın diye.
   *
   * Admin'in "sıfırlama e-postası gönder" işlemi bunu DEĞİL, bekleyen
   * `requestForCompany`'yi çağırır (orada süre sır değil, sonuç önemli).
   */
  requestForCompanyInBackground(rawEmail: string): { success: true } {
    const job: Promise<void> = this.requestForCompany(rawEmail)
      .then(() => undefined)
      .catch((err: unknown) => {
        this.logger.error(
          `Password reset request failed after the response (${maskEmail(
            String(rawEmail).trim().toLowerCase(),
          )}): ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        this.background.delete(job);
      });
    this.background.add(job);
    return { success: true };
  }

  /** Arkada süren sıfırlama işleri bitene dek bekler (hata fırlatmaz). */
  async whenIdle(): Promise<void> {
    while (this.background.size > 0) {
      await Promise.all([...this.background]);
    }
  }

  /**
   * Süreç kapanırken süren işler beklenir — ama SINIRLI: takılı kalmış bir
   * e-posta çağrısı kapanışı (ve yeni sürümün açılışını) rehin alamaz.
   */
  async onModuleDestroy(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const capped = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, BACKGROUND_SHUTDOWN_WAIT_MS);
      timer.unref();
    });
    try {
      await Promise.race([this.whenIdle(), capped]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
      cu.email,
      ACCOUNT_SETUP_TTL_HOURS * 60,
      locale,
      // Sayfa "Şifreni sıfırla / Hatırladın mı?" yerine yeni hesaba uygun
      // "Şifreni belirle" metnini gösterir (arayüz testi api2-02 yeniden
      // doğrulama). Yalnız görünüm ipucu: yetki token'dadır.
      { setup: true },
    );
    // The account left this address while the link was being written.
    if (!resetUrl) return { sent: false };
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

  /**
   * Is `email` still the address of the account? Locking read (FOR SHARE): it
   * waits for an uncommitted address change on the row and then sees the new
   * value. Single autocommit statement - no lock is held afterwards. The same
   * check `CompanyAuthService` runs for e-mail codes.
   */
  private async isCurrentAddress(userId: string, email: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM company_users WHERE id = ${userId} AND email = ${email} FOR SHARE`;
    return rows.length === 1;
  }

  /**
   * Tek aktif token politikası + yeni token; dil ön ekli bağlantıyı döner.
   *
   * `email` = the address the link is about to be MAILED to. A link proves
   * that address and the row does not store it, so a link must never outlive
   * the account's stay at it (arayuz testi 2026-10 authsec-2/authsec-3). An
   * address change deletes the account's links together with the move; this
   * is the other half: a caller that read the address BEFORE a concurrent
   * change would write its row after that clean-up and mail a live link for
   * the moved account to the old mailbox. Checked after the row exists and
   * before the mail goes out - the locking read waits for a change in flight.
   * Returns null when the account is no longer at `email`: the row is
   * removed and the caller sends nothing.
   */
  private async createTokenUrl(
    owner: ResetOwner,
    email: string,
    ttlMinutes: number,
    locale: Locale,
    opts: { setup?: boolean } = {},
  ): Promise<string | null> {
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

    const created = await this.prisma.passwordResetToken.create({
      data: { ...owner, tokenHash, expiresAt },
      select: { id: true },
    });
    if (!(await this.isCurrentAddress(owner.companyUserId, email))) {
      await this.prisma.passwordResetToken.deleteMany({ where: { id: created.id } });
      this.logger.warn(
        `Password link dropped: the account address changed while the link was being issued (user=${owner.companyUserId})`,
      );
      return null;
    }

    const baseUrl = (
      resolveWebUrl(this.config)
    ).replace(/\/$/, "");
    const setup = opts.setup ? "&setup=1" : "";
    return `${baseUrl}${localizeAppPath(`/reset-password?token=${plainToken}${setup}`, locale)}`;
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
      email,
      PASSWORD_RESET_TTL_MINUTES,
      locale,
    );
    // The account left this address while the link was being written.
    if (!resetUrl) return;

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
