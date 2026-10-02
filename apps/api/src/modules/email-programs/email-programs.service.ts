import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isLocale, type Locale } from "@rothern/i18n";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { tApi, type ApiMessageKey } from "../../common/i18n/i18n.service";
import { appRoutes, localizeAppPath } from "../../common/company/app-routes";
import { resolveWebUrl } from "../../common/config/web-url";
import { formatInviteDeadline } from "../../common/company/invite-delivery";
import { listingTitleParam } from "../../common/notifications/notification-params";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";
import { looksLikeProse, tierAtLeast } from "@rothern/shared";
import { effectiveTier } from "../../common/company/effective-tier";
import { isConnectionValid } from "../../common/company/valid-connection";
import { timeZoneForCountry } from "../../common/time/country-time-zone";
import {
  digestDue,
  inLifecycleWindow,
  isLocalMonday,
  lifecycleAllowed,
  localDayStart,
  nextLifecycleStep,
  weekIndexOf,
  weeklySummaryAllowed,
  type LifecycleStep,
} from "../../common/email/email-program-policy";
import { EMAIL_LOG_HANDLED_WHERE, EmailService } from "../email/email.service";
import { ContentTranslationService } from "../content-translation/content-translation.service";
import { NotificationService } from "../notifications/notification.service";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Özette en fazla bu kadar talep satırı (fazlası "Açık Talepler"de). */
const DIGEST_MAX_ROWS = 15;
const GREETING = "api.notifications.common.greeting" as const;

export const CATEGORY_DIGEST_CONTEXT = "listing_category_digest";
export const INVITATION_DIGEST_CONTEXT = "listing_invitation_digest";
export const ZERO_BID_CONTEXT = "listing_zero_bid";
export const LIFECYCLE_WEEKLY_CONTEXT = "lifecycle_weekly";
const lifecycleContext = (step: LifecycleStep) => `lifecycle_${step}`;

interface Owner {
  id: string;
  email: string;
  firstName: string;
  locale: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  isActive: boolean;
  deletedAt: Date | null;
  notificationPrefs: unknown;
}

/**
 * GÜNLÜK E-POSTA PROGRAMI (2026-09-27, Faz 2; kullanıcı: "haftada 1 az, her
 * gün gönderelim; kayıtlıya kategorisi uyuşuyorsa sık gönderelim"). Kurallar
 * `common/email/email-program-policy.ts`, burada uygulanır. Hepsi 15 dk'lık tek
 * işten (`emailPrograms.tick`) koşar ve kendi tekilliğini EmailLog'dan okur:
 *  - AKŞAM ÖZETİ: anlık hakkı dolan kategori eşleşmeleri alıcının yerel
 *    18:00'inde tek e-postada (`email_digest_items`).
 *  - KARŞILAMA SERİSİ (LIFECYCLE akışı): profil → ilk ürün → doğrulama →
 *    pazar; davranışa bağlı, firma başına günde bir, yerel 10:00.
 *  - HAFTALIK GÖRÜNÜRLÜK ÖZETİ: pazartesi yerel 10:00, görüntülenme varsa;
 *    ilgi azaldıkça seyrelir.
 *  - TEKLİFSİZ TALEP: kapanışa 12-72 saat kala hiç teklif yoksa talebi açana
 *    bir kez (AI önerisine ve süre uzatmaya çağırır).
 * Metinler alıcının dilinde; kullanıcı tercihleri (`lifecycle`, `categoryMatch`,
 * `reminder`) ve tek tık çıkış gönderim hattında uygulanır.
 */
@Injectable()
export class EmailProgramsService {
  private readonly logger = new Logger(EmailProgramsService.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    @Optional() private readonly translations?: ContentTranslationService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  private get web(): string {
    return resolveWebUrl(this.config);
  }

  async tick(now: Date = new Date()) {
    const digests = await this.sendDigests(now);
    const lifecycle = await this.sendLifecycle(now);
    const weekly = await this.sendWeeklySummaries(now);
    const zeroBid = await this.sendZeroBidReminders(now);
    return { digests, lifecycle, weekly, zeroBid };
  }

  // ------------------------------------------------------------ akşam özeti

  async sendDigests(now: Date): Promise<number> {
    const items = await this.prisma.emailDigestItem.findMany({
      where: { sentAt: null },
      orderBy: { createdAt: "asc" },
      take: 3000,
      select: { id: true, email: true, kind: true, locale: true, companyId: true, listingId: true, locked: true, createdAt: true },
    });
    if (items.length === 0) return 0;
    // Adres × tür başına bir özet: kategori eşleşmesi ve talep davetleri ayrı.
    const byEmail = new Map<string, typeof items>();
    for (const it of items) {
      const k = `${it.kind}|${it.email}`;
      byEmail.set(k, [...(byEmail.get(k) ?? []), it]);
    }
    const companyRows = await this.prisma.company.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.companyId))] } },
      select: { id: true, country: true, companyVerificationStatus: true },
    });
    const countryOf = new Map(companyRows.map((c) => [c.id, c.country]));
    // Kilitli özette doğrulanmamış firmaya önce ücretsiz doğrulama (2026-09-28).
    const unverifiedIds = new Set(
      companyRows
        .filter((c) => c.companyVerificationStatus !== "VERIFIED" && c.companyVerificationStatus !== "PENDING")
        .map((c) => c.id),
    );
    const verificationOf = new Map(companyRows.map((c) => [c.id, c.companyVerificationStatus]));

    const emails = [...new Set(items.map((i) => i.email))];
    // Günde TEK özet (derin denetim MU-14): adres × tür başına son gönderilen
    // özet. Eskiden 18:00 özetinden sonra düşen her kalem sonraki 15 dk'lık
    // turda ayrı bir "özet" olarak gidiyordu.
    const lastDigests = await this.prisma.emailLog.groupBy({
      by: ["toEmail", "contextType"],
      where: {
        toEmail: { in: emails },
        contextType: { in: [CATEGORY_DIGEST_CONTEXT, INVITATION_DIGEST_CONTEXT] },
        status: { not: "FAILED" },
        queuedAt: { gte: new Date(now.getTime() - 2 * DAY_MS) },
      },
      _max: { queuedAt: true },
    });
    const lastDigestOf = new Map(lastDigests.map((r) => [`${r.contextType}|${r.toEmail}`, r._max.queuedAt]));
    // Tercih ve tek tık çıkış GÖNDERİM anında da uygulanır: kayıtlı kullanıcının
    // çıkışı yalnız `notificationPrefs`e yazılır, EmailService kapısı ona bakmaz;
    // kuyruğa alındıktan sonra kapatılan tercih yok sayılıyordu (MU-14).
    const users = await this.prisma.companyUser.findMany({
      where: { email: { in: emails } },
      select: { email: true, isActive: true, deletedAt: true, notificationPrefs: true },
    });
    const userOf = new Map(users.map((u) => [u.email, u]));

    let sent = 0;
    for (const [, group] of byEmail) {
      const email = group[0]!.email;
      const isInvite = group[0]!.kind === "INVITATION";
      const context = isInvite ? INVITATION_DIGEST_CONTEXT : CATEGORY_DIGEST_CONTEXT;
      const tz = timeZoneForCountry(countryOf.get(group[0]!.companyId));
      const lastDigestAt = lastDigestOf.get(`${context}|${email}`) ?? null;
      if (!digestDue({ now, timeZone: tz, oldestItemAt: group[0]!.createdAt, lastDigestAt })) continue;
      const markSent = () =>
        this.prisma.emailDigestItem.updateMany({ where: { id: { in: group.map((g) => g.id) } }, data: { sentAt: now } });
      const user = userOf.get(email);
      if (
        !user ||
        !user.isActive ||
        user.deletedAt ||
        !isNotificationEnabled(user.notificationPrefs as Record<string, boolean> | null, context)
      ) {
        // Alıcı yok / pasif / tercihi kapalı → özet gitmez, kalemler düşer.
        await markSent();
        continue;
      }
      const listings = await this.prisma.listing.findMany({
        where: { id: { in: group.map((g) => g.listingId) }, status: "OPEN" },
        select: { id: true, title: true, number: true, closesAt: true, companyId: true },
        orderBy: { closesAt: "asc" },
      });
      if (listings.length === 0) {
        await markSent();
        continue;
      }
      const locale: Locale = isLocale(group[0]!.locale) ? group[0]!.locale : "tr";
      const shown = listings.slice(0, DIGEST_MAX_ROWS);
      const localized = this.translations
        ? await this.translations
            .localizeListings(shown.map((l) => ({ title: l.title })), shown.map((l) => l.id), locale)
            .catch(() => shown.map((l) => ({ title: l.title })))
        : shown.map((l) => ({ title: l.title }));
      const allLocked = !isInvite && group.every((g) => g.locked);
      const verifyFirst = allLocked && unverifiedIds.has(group[0]!.companyId);
      // Kilitsiz (ücretli ya da bağlantılı) ama doğrulanmamış / incelemedeki
      // firma: anlık e-postadaki D-163 ipucu özette de verilir — bağlantısız
      // alıcının talebine teklif KYC ister (yeniden doğrulama api1-02).
      const paidKyc =
        !isInvite && !group.some((g) => g.locked)
          ? await this.digestKycHint(
              group[0]!.companyId,
              verificationOf.get(group[0]!.companyId),
              listings.map((l) => l.companyId),
            )
          : null;
      const t = (key: ApiMessageKey, p?: Record<string, string | number>) => tApi(key, p, locale);
      const subject = t(isInvite ? "api.notifications.digest.invitationSubject" : "api.notifications.digest.subject", {
        n: listings.length,
      });
      try {
        await this.email.send({
          to: { email },
          locale,
          subject,
          templateData: {
            template: "notification",
            data: {
              subject,
              heading: subject,
              paragraphs: [
                t(GREETING),
                t(
                  isInvite
                    ? "api.notifications.digest.invitationBody"
                    : verifyFirst
                      ? "api.notifications.digest.bodyLockedUnverified"
                      : allLocked
                        ? "api.notifications.digest.bodyLocked"
                        : paidKyc === "unverified"
                          ? "api.notifications.digest.bodyUnverified"
                          : paidKyc === "pending"
                            ? "api.notifications.digest.bodyPending"
                            : "api.notifications.digest.body",
                ),
              ],
              infoRows: shown.map((l, i) => ({
                label: `${localized[i]?.title ?? l.title}${l.number ? ` (${l.number})` : ""}`,
                value: l.closesAt
                  ? t("api.notifications.digest.closesRow", { date: formatInviteDeadline(l.closesAt, locale) })
                  : "—",
              })),
              ctaLabel: t(
                isInvite
                  ? "api.notifications.digest.invitationCta"
                  : verifyFirst || paidKyc === "unverified"
                    ? "api.notifications.listings.cta.verifyFree"
                    : allLocked
                      ? "api.notifications.listings.cta.upgradeSilver"
                      : "api.notifications.digest.cta",
              ),
              ctaUrl: `${this.web}${localizeAppPath(
                verifyFirst || paidKyc === "unverified"
                  ? "/company/ayarlar/dogrulama"
                  : allLocked
                    ? "/company/premium"
                    : "/company/satis",
                locale,
              )}`,
              footerNote: t("api.notifications.digest.footer"),
            },
          },
          context: { type: context, id: group[0]!.id },
        });
        await markSent();
        sent++;
      } catch (err) {
        this.logger.warn(`digest send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return sent;
  }

  /**
   * Kilitsiz kategori özetinde doğrulama ipucu (anlık e-postanın paidKyc
   * aynası, CompanyListingsService.notifyCategoryMatch): firma doğrulanmamış /
   * incelemedeyse ve özetteki taleplerden en az birinin sahibiyle GEÇERLİ
   * bağlantısı yoksa (bağlantılı alıcıya teklif KYC'den muaf) ipucu döner.
   */
  private async digestKycHint(
    companyId: string,
    status: string | undefined,
    ownerIds: string[],
  ): Promise<"unverified" | "pending" | null> {
    if (!status || status === "VERIFIED" || ownerIds.length === 0) return null;
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId, inviteeCompanyId: { in: ownerIds } },
          { inviteeCompanyId: companyId, inviterCompanyId: { in: ownerIds } },
        ],
      },
      select: {
        inviterCompanyId: true,
        inviteeCompanyId: true,
        origin: true,
        inviter: { select: { tier: true, membershipEndAt: true } },
      },
    });
    const connected = new Set(
      rows
        .filter((r) => isConnectionValid(r))
        .map((r) => (r.inviterCompanyId === companyId ? r.inviteeCompanyId : r.inviterCompanyId)),
    );
    if (ownerIds.every((id) => connected.has(id))) return null;
    return status === "PENDING" ? "pending" : "unverified";
  }

  // ------------------------------------------------------------ karşılama serisi

  private async ownerOf(ownerUserId: string | null): Promise<Owner | null> {
    if (!ownerUserId) return null;
    const u = await this.prisma.companyUser.findUnique({
      where: { id: ownerUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        locale: true,
        lastLoginAt: true,
        createdAt: true,
        isActive: true,
        deletedAt: true,
        notificationPrefs: true,
      },
    });
    return u && u.isActive && !u.deletedAt ? u : null;
  }

  private lifecycleOn(owner: Owner): boolean {
    return isNotificationEnabled(owner.notificationPrefs as Record<string, boolean> | null, "lifecycle_profile");
  }

  /** Karşılama serisi / teklifsiz talep taramasında sayfa boyu (testte küçültülür). */
  private readonly scanPageSize = 500;

  /**
   * Tüm adayları `id` imleciyle sayfa sayfa gezer. Eskiden sırasız tek
   * `take` vardı; saat dilimi / "bugün gönderildi" süzgeçleri kesimden SONRA
   * uygulandığı için tavanın üstündeki firmalara/taleplere hiç sıra gelmiyordu
   * (derin denetim MU-14).
   */
  private async scanAll<T extends { id: string }>(
    fetch: (page: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await fetch({ take: this.scanPageSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      all.push(...page);
      if (page.length < this.scanPageSize) return all;
      cursor = page[page.length - 1]!.id;
    }
  }

  async sendLifecycle(now: Date): Promise<number> {
    const companies = await this.scanAll((page) =>
      this.prisma.company.findMany({
        where: {
          isActive: true,
          isBlocked: false,
          onboardingCompletedAt: { gte: new Date(now.getTime() - 30 * DAY_MS), lte: new Date(now.getTime() - DAY_MS) },
          ownerUserId: { not: null },
        },
        select: {
          id: true,
          country: true,
          aboutText: true,
          tier: true,
          membershipEndAt: true,
          companyVerificationStatus: true,
          onboardingCompletedAt: true,
          ownerUserId: true,
        },
        orderBy: { id: "asc" },
        ...page,
      }),
    );
    let sent = 0;
    for (const c of companies) {
      const tz = timeZoneForCountry(c.country);
      if (!inLifecycleWindow(now, tz)) continue;
      const owner = await this.ownerOf(c.ownerUserId);
      if (!owner || !this.lifecycleOn(owner) || !lifecycleAllowed(owner.lastLoginAt, owner.createdAt, now)) continue;
      const history = await this.prisma.emailLog.findMany({
        // Suppress/çıkış nedeniyle atlanan adım da "denendi" sayılır; yoksa
        // pencerenin her 15 dk'lık turunda yeni FAILED satırı (LU-18).
        where: { contextId: c.id, contextType: { startsWith: "lifecycle_" }, ...EMAIL_LOG_HANDLED_WHERE },
        select: { contextType: true, queuedAt: true },
      });
      // Firma başına günde bir ipucu.
      if (history.some((h) => h.queuedAt >= localDayStart(now, tz))) continue;
      const sentSteps = new Set(
        history.map((h) => h.contextType?.replace(/^lifecycle_/, "")).filter(Boolean) as LifecycleStep[],
      );
      const [productCount, matches] = await Promise.all([
        this.prisma.companyItem.count({ where: { companyId: c.id, isActive: true } }),
        this.prisma.notification.findMany({
          where: { companyId: c.id, type: "listing_category_match", createdAt: { gte: new Date(now.getTime() - 14 * DAY_MS) } },
          select: { listingId: true },
          distinct: ["listingId"],
        }),
      ]);
      const free = !tierAtLeast(effectiveTier(c.tier, c.membershipEndAt), "SILVER");
      const step = nextLifecycleStep(
        {
          onboardedAt: c.onboardingCompletedAt,
          paid: !free,
          hasProfileText: !!c.aboutText && looksLikeProse(c.aboutText),
          productCount,
          verification: c.companyVerificationStatus,
          recentMatches: matches.length,
          sent: sentSteps,
        },
        now,
      );
      if (!step) continue;
      if (await this.sendLifecycleEmail(c.id, owner, step, { matches: matches.length, free })) sent++;
    }
    return sent;
  }

  private async sendLifecycleEmail(
    companyId: string,
    owner: Owner,
    step: LifecycleStep,
    p: { matches: number; free: boolean },
  ): Promise<boolean> {
    const locale: Locale = isLocale(owner.locale) ? owner.locale : "tr";
    const t = (key: ApiMessageKey, v?: Record<string, string | number>) => tApi(key, v, locale);
    const K = {
      profile: { cta: "/company/sirketim/profil" },
      first_product: { cta: "/company/satis/urunlerim?yeni=1" },
      verify: { cta: "/company/ayarlar/dogrulama" },
      market: { cta: p.free ? "/company/premium" : "/company/satis" },
      verify_again: { cta: "/company/ayarlar/dogrulama" },
      silver: { cta: "/company/premium" },
    }[step];
    const base = `api.notifications.lifecycle.${step}` as const;
    const locked = step === "market" && p.free;
    const bodyKey = (locked ? `${base}.bodyLocked` : `${base}.body`) as ApiMessageKey;
    // Kilitli pazar e-postası paket sayfasına gider: düğme de "Silver'a geç"
    // der, "Açık talepleri gör" değil (derin denetim boşluk taraması GA2).
    const ctaKey = (locked ? `${base}.ctaLocked` : `${base}.cta`) as ApiMessageKey;
    const subject = t(`${base}.subject` as ApiMessageKey, { n: p.matches });
    try {
      const res = await this.email.send({
        to: { email: owner.email, name: owner.firstName },
        locale,
        subject,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: subject,
            paragraphs: [t(GREETING), t(bodyKey, { n: p.matches })],
            ctaLabel: t(ctaKey),
            ctaUrl: `${this.web}${localizeAppPath(K.cta, locale)}`,
          },
        },
        context: { type: lifecycleContext(step), id: companyId },
      });
      return res.sent;
    } catch (err) {
      this.logger.warn(`lifecycle ${step} failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ------------------------------------------------------------ haftalık özet

  async sendWeeklySummaries(now: Date): Promise<number> {
    const views = await this.prisma.companyView.groupBy({
      by: ["targetCompanyId"],
      where: { viewedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      _count: { _all: true },
    });
    if (views.length === 0) return 0;
    const countOf = new Map(views.map((v) => [v.targetCompanyId, v._count._all]));
    // Üye firmaların (kimlikli, panel) görüntülemeleri — ücretsize "hangi
    // firmalar olduğunu Silver'da görün" çağrısı için.
    const memberViews = await this.prisma.companyView.groupBy({
      by: ["targetCompanyId"],
      where: { viewedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, viewerCompanyId: { not: null } },
      _count: { _all: true },
    });
    const membersOf = new Map(memberViews.map((v) => [v.targetCompanyId, v._count._all]));
    const companies = await this.prisma.company.findMany({
      where: { id: { in: [...countOf.keys()] }, isActive: true, isBlocked: false, ownerUserId: { not: null } },
      select: { id: true, country: true, ownerUserId: true, tier: true, membershipEndAt: true, companyVerificationStatus: true },
    });
    const week = weekIndexOf(now);
    let sent = 0;
    for (const c of companies) {
      const tz = timeZoneForCountry(c.country);
      if (!isLocalMonday(now, tz) || !inLifecycleWindow(now, tz)) continue;
      const already = await this.prisma.emailLog.findFirst({
        where: {
          contextType: LIFECYCLE_WEEKLY_CONTEXT,
          contextId: c.id,
          ...EMAIL_LOG_HANDLED_WHERE,
          queuedAt: { gte: new Date(now.getTime() - 6 * DAY_MS) },
        },
        select: { id: true },
      });
      if (already) continue;
      const owner = await this.ownerOf(c.ownerUserId);
      if (!owner || !this.lifecycleOn(owner) || !weeklySummaryAllowed(owner.lastLoginAt, now, week)) continue;
      const locale: Locale = isLocale(owner.locale) ? owner.locale : "tr";
      const n = countOf.get(c.id) ?? 0;
      const members = membersOf.get(c.id) ?? 0;
      const t = (key: ApiMessageKey) => tApi(key, { n, members }, locale);
      const subject = t("api.notifications.lifecycle.weekly.subject");
      // Ücretli: ziyaretçi listesi. Ücretsiz + doğrulanmamış: önce doğrulama
      // (paket alımının tek şartı). Ücretsiz + doğrulanmış/incelemede: Silver.
      const free = !tierAtLeast(effectiveTier(c.tier, c.membershipEndAt), "SILVER");
      const unverified = c.companyVerificationStatus !== "VERIFIED" && c.companyVerificationStatus !== "PENDING";
      const variant = !free ? "paid" : unverified ? "unverified" : "free";
      const W = {
        paid: {
          body: "api.notifications.lifecycle.weekly.body",
          cta: "api.notifications.lifecycle.weekly.cta",
          path: "/company/sirketim/ziyaretciler",
        },
        free: {
          body: members > 0 ? "api.notifications.lifecycle.weekly.bodyFree" : "api.notifications.lifecycle.weekly.bodyFreeAnon",
          cta: "api.notifications.lifecycle.weekly.ctaFree",
          path: "/company/premium",
        },
        unverified: {
          body: "api.notifications.lifecycle.weekly.bodyUnverified",
          cta: "api.notifications.lifecycle.weekly.ctaUnverified",
          path: "/company/ayarlar/dogrulama",
        },
      }[variant] as { body: ApiMessageKey; cta: ApiMessageKey; path: string };
      try {
        const res = await this.email.send({
          to: { email: owner.email, name: owner.firstName },
          locale,
          subject,
          templateData: {
            template: "notification",
            data: {
              subject,
              heading: subject,
              paragraphs: [tApi(GREETING, undefined, locale), t(W.body)],
              ctaLabel: t(W.cta),
              ctaUrl: `${this.web}${localizeAppPath(W.path, locale)}`,
            },
          },
          context: { type: LIFECYCLE_WEEKLY_CONTEXT, id: c.id },
        });
        if (res.sent) sent++;
      } catch (err) {
        this.logger.warn(`weekly summary failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return sent;
  }

  // ------------------------------------------------------------ teklifsiz talep

  async sendZeroBidReminders(now: Date): Promise<number> {
    const listings = await this.scanAll((page) =>
      this.prisma.listing.findMany({
        where: {
          status: "OPEN",
          // En az 24 saat yayında (arayüz testi D-154): kapanışı 3 gün sonraki
          // talep yayınlandıktan dakikalar sonra "henüz teklif almadı"
          // hatırlatması alıyordu — tedarikçilere fırsat tanınmadan.
          publishedAt: { not: null, lte: new Date(now.getTime() - 24 * HOUR_MS) },
          closesAt: { gt: new Date(now.getTime() + 12 * HOUR_MS), lte: new Date(now.getTime() + 72 * HOUR_MS) },
          bids: { none: { status: { not: "DRAFT" } } },
        },
        select: { id: true, title: true, number: true, closesAt: true, createdById: true, aiDiscovery: true },
        orderBy: { id: "asc" },
        ...page,
      }),
    );
    let sent = 0;
    for (const l of listings) {
      // Tekillik iki kanaldan ayrı ayrı: e-posta EmailLog'dan, uygulama içi
      // bildirim tablosundan (e-postası kapalı kullanıcıya da BİR kez).
      const [mailed, notified] = await Promise.all([
        this.prisma.emailLog.findFirst({ where: { contextType: ZERO_BID_CONTEXT, contextId: l.id }, select: { id: true } }),
        this.prisma.notification.findFirst({ where: { type: ZERO_BID_CONTEXT, listingId: l.id }, select: { id: true } }),
      ]);
      if (mailed && notified) continue;
      const user = await this.ownerOf(l.createdById);
      if (!user) continue;
      const path = `/company/ilan/${l.id}${l.aiDiscovery ? "?ai-davet=1" : ""}`;
      if (!notified) {
        await this.notifications
          ?.pushToUser(user.id, {
            type: ZERO_BID_CONTEXT,
            // Talep sahibinin (alıcı) hatırlatması → Satınalma süzgeci + rozet
            // (arayüz testi D-115; portalsız satır Satış süzgecinde de çıkıyordu).
            portal: "satinalma",
            titleKey: "api.notifications.zeroBid.heading",
            bodyKey: "api.notifications.zeroBid.inAppBody",
            ctaLabelKey: "api.notifications.zeroBid.cta",
            params: { title: listingTitleParam(l.id, l.title) },
            ctaPath: path,
            listingId: l.id,
          })
          .catch(() => undefined);
      }
      if (mailed || !isNotificationEnabled(user.notificationPrefs as Record<string, boolean> | null, ZERO_BID_CONTEXT)) {
        continue;
      }
      const locale: Locale = isLocale(user.locale) ? user.locale : "tr";
      const vals = {
        title: l.title,
        number: l.number ?? "—",
        closesAt: l.closesAt ? formatInviteDeadline(l.closesAt, locale) : "—",
      };
      const t = (key: ApiMessageKey) => tApi(key, vals, locale);
      const subject = t("api.notifications.zeroBid.subject");
      try {
        const res = await this.email.send({
          to: { email: user.email, name: user.firstName },
          locale,
          subject,
          templateData: {
            template: "notification",
            data: {
              subject,
              heading: t("api.notifications.zeroBid.heading"),
              paragraphs: [tApi(GREETING, undefined, locale), t("api.notifications.zeroBid.body")],
              ctaLabel: t("api.notifications.zeroBid.cta"),
              ctaUrl: `${appRoutes.listing(this.web, l.id, locale)}${l.aiDiscovery ? "?ai-davet=1" : ""}`,
            },
          },
          context: { type: ZERO_BID_CONTEXT, id: l.id },
        });
        if (res.sent) sent++;
      } catch (err) {
        this.logger.warn(`zero-bid reminder failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return sent;
  }
}
