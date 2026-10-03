import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { i18nMessage } from "../../common/i18n/http-i18n";
import { NOTIFICATION_PREF_KEYS } from "../../common/notifications/notification-prefs";
import { PrismaBypassService, PrismaService } from "../../common/prisma/prisma.service";
import type { UnsubscribeScope } from "./email-streams";
import { verifyUnsubscribeToken, type UnsubscribePayload } from "./unsubscribe-token";

/** "ayse.kaya@firma.com" → "ay•••@firma.com" — sayfada kimin çıktığı belli olsun, adres ifşa olmasın. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}•••${email.slice(at)}`;
}

/**
 * TEK TIK ÇIKIŞ (2026-09-27) — e-postadaki bağlantı ve RFC 8058 başlığı.
 *
 * Kural: kayıtlı KULLANICININ bildirim türleri `notificationPrefs`e yazılır
 * (Ayarlar › Bildirimler aynı değeri gösterir ve geri açabilir) VE ayrıca tür
 * başına `email_opt_outs`a (adres aynı zamanda firma `billingEmail`i olabilir —
 * o dal tercihsiz gider); kullanıcı olmayan adres (firma `billingEmail`i)
 * yalnız `email_opt_outs`a, davet kapsamı mevcut `referral_opt_outs`a yazılır.
 * Gönderim servisi üçüne de bakar.
 *
 * Uç guard'sız ve herkese açık: jeton imzalı (adres + kapsam), tahmin edilemez;
 * GET yalnız OKUR (güvenlik tarayıcıları bağlantıyı açtığında abonelik
 * düşmesin), değişiklik POST'la.
 */
@Injectable()
export class EmailUnsubscribeService {
  private readonly logger = new Logger(EmailUnsubscribeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    // Kullanıcı başka firmanın kiracısı — uç kimliksiz, RLS bağlamı yok.
    private readonly bypass: PrismaBypassService,
  ) {}

  private verify(token: string | undefined): UnsubscribePayload {
    const secret = this.config.get<string>("JWT_SECRET");
    const payload = secret ? verifyUnsubscribeToken(token, secret) : null;
    if (!payload) {
      throw new BadRequestException(
        i18nMessage("api.emailUnsubscribe.invalidLink", undefined, "INVALID_TOKEN"),
      );
    }
    return payload;
  }

  /** Sayfa çizimi: kapsam, maskeli adres ve zaten çıkılmış mı. */
  async describe(token: string | undefined) {
    const p = this.verify(token);
    return {
      scope: p.scope,
      email: maskEmail(p.email),
      locale: p.locale,
      unsubscribed: await this.isOut(p.email, p.scope),
    };
  }

  /** `all: true` → yalnız o tür değil, işlem dışı TÜM e-postalar. */
  async unsubscribe(token: string | undefined, all = false) {
    const p = this.verify(token);
    const scope: UnsubscribeScope = all ? "all" : p.scope;
    await this.apply(p.email.toLowerCase(), scope);
    this.logger.log(`unsubscribe: scope=${scope}`);
    return { ok: true as const, scope };
  }

  private async apply(email: string, scope: UnsubscribeScope): Promise<void> {
    if (scope === "invite" || scope === "all") {
      await this.prisma.referralOptOut.upsert({ where: { email }, create: { email }, update: {} });
      if (scope === "invite") return;
    }
    const user = await this.bypass.companyUser.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, notificationPrefs: true },
    });
    if (user) {
      // Kayıtlı kullanıcının tercihi TEK yerde: Ayarlar › Bildirimler aynı
      // değeri gösterir ve geri açabilir (karşılama serisi `lifecycle` dahil).
      const prefs = { ...((user.notificationPrefs as Record<string, boolean> | null) ?? {}) };
      const keys = scope === "all" ? NOTIFICATION_PREF_KEYS : [scope];
      for (const k of keys) prefs[k] = false;
      await this.bypass.companyUser.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
      // Derin denetim MU-05: ayni adres bir firmanin `billingEmail`i de
      // olabilir; o dal tercihsiz gider (pickCompanyRecipients `prefs: null`)
      // ve EmailService yalniz email_opt_outs'a bakar. Adres kaydini da yaz ki
      // RFC 8058 cikisi her dalda islesin. Tur basina satir ("all" yerine):
      // Ayarlar'da bir turu yeniden acmak yalniz o satiri (ve varsa "all"u)
      // siler, digerleri kapali kalir (company-auth updateNotificationPrefs).
      await this.prisma.emailOptOut.createMany({
        data: keys.map((k) => ({ email, scope: k })),
        skipDuplicates: true,
      });
      return;
    }
    await this.optOut(email, scope);
  }

  private async optOut(email: string, scope: string): Promise<void> {
    await this.prisma.emailOptOut.upsert({
      where: { email_scope: { email, scope } },
      create: { email, scope },
      update: {},
    });
  }

  private async isOut(emailRaw: string, scope: UnsubscribeScope): Promise<boolean> {
    const email = emailRaw.toLowerCase();
    if (scope === "invite") {
      return !!(await this.prisma.referralOptOut.findUnique({ where: { email }, select: { email: true } }));
    }
    const row = await this.prisma.emailOptOut.findFirst({
      where: { email, scope: { in: [scope, "all"] } },
      select: { id: true },
    });
    if (row) return true;
    const user = await this.bypass.companyUser.findFirst({
      where: { email, deletedAt: null },
      select: { notificationPrefs: true },
    });
    const prefs = (user?.notificationPrefs as Record<string, boolean> | null) ?? {};
    if (!user) return false;
    return scope === "all"
      ? NOTIFICATION_PREF_KEYS.every((k) => prefs[k] === false)
      : prefs[scope] === false;
  }
}
