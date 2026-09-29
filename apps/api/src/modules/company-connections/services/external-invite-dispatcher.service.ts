import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@rothern/db";
import { inviteFromName, type TenderInviteDigestEntry } from "@rothern/email";
import { isLocale, type Locale } from "@rothern/i18n";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { appRoutes } from "../../../common/company/app-routes";
import { resolveWebUrl } from "../../../common/config/web-url";
import {
  INVITE_LISTING_SELECT,
  InviteContentBuilder,
  type InviteListing,
} from "../../../common/company/external-invite-content";
import {
  coldInviteDailyCap,
  INVITE_DIGEST_MAX,
  INVITE_MAX_ATTEMPTS,
  INVITE_PAUSE_WINDOW_DAYS,
  INVITE_RETRY_MINUTES,
  inviteHoldUntil,
  invitePaused,
  REMINDER_BEFORE_CLOSE_HOURS,
  REMINDER_MIN_LEFT_HOURS,
  reminderDue,
  utcDayStart,
  type ColdInviteCap,
  type InviteSourceKind,
} from "../../../common/company/external-invite-policy";
import { nextBusinessWindow, timeZoneForCountry } from "../../../common/time/country-time-zone";
import { EmailService } from "../../email/email.service";
import { ContentTranslationService } from "../../content-translation/content-translation.service";

/** Davet e-postalarının bağlam tipi — sayım, tavan ve INVITE akışı bununla. */
export const INVITE_CONTEXT = "tender_external_invite";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Çeviri gelmediyse en fazla bu kadar beklenir, sonra özgün metinle gider. */
const TRANSLATION_GRACE_MS = 10 * 60_000;
/** Bir turda bakılan en fazla sırası gelmiş davet. */
const DUE_BATCH = 300;

/**
 * Davet e-postası gidebilecek talep: yayında (OPEN), açılış embargosu geçmiş
 * (`bidsOpenAt` boş ya da geçmişte — embargolu talebin kalemleri açılıştan
 * önce dışarı çıkmasın) ve sahibi etkin/askısız (askıya alınan firmanın
 * adıyla "X (Rothern üzerinden)" e-postası gitmesin). Uymayan davet İPTAL
 * EDİLMEZ, bekler: embargo/askı kalkınca gider; talep kapanınca iptal olur.
 * (Yayın denetimi 2026-09-28, B4-3/B4-8.)
 */
function sendableListingWhere(now: Date): Prisma.ListingWhereInput {
  return {
    status: "OPEN",
    OR: [{ bidsOpenAt: null }, { bidsOpenAt: { lte: now } }],
    company: { isActive: true, isBlocked: false },
  };
}

const DUE_SELECT = {
  id: true,
  listingId: true,
  email: true,
  locale: true,
  country: true,
  source: true,
  attempts: true,
  createdAt: true,
  referralInviteId: true,
  referralInvite: { select: { token: true } },
  listing: { select: INVITE_LISTING_SELECT },
} as const;

type DueInvite = {
  id: string;
  listingId: string;
  email: string;
  locale: string;
  country: string | null;
  source: InviteSourceKind;
  attempts: number;
  createdAt: Date;
  referralInviteId: string;
  referralInvite: { token: string };
  listing: InviteListing;
};

export interface DispatchReport {
  cap: ColdInviteCap;
  sent: number;
  deferred: number;
  cancelled: number;
  reminders: number;
}

/**
 * KAYITSIZ ADRESLERE TALEP DAVETİ GÖNDERİMİ — dakikalık iş (2026-09-27, Faz 0b).
 *
 * Kuyruktaki (`external_listing_invites`, QUEUED) davetleri kurallarla gönderir
 * (kurallar `external-invite-policy.ts`te, burada yalnız uygulanır):
 *  - talep YAYINDA değilse bekler; kapanmış/iptal talebin davetleri düşer
 *  - platform günlük tavanı (ölçüme bağlı ısınma + fren)
 *  - adres başına 7 gün (AI kaynaklı); bekleyenler tek e-postada toplanır
 *  - ilgi göstermiş adrese fren yok; 3 yanıtsız e-postadan sonra duraklar
 *  - çıkmış/kayıtlı adrese gitmez; çeviri 10 dk içinde gelmezse özgün metin
 *  - kapanıştan önce tek hatırlatma
 * Okuma/yazma bypass istemcisiyle: iş kiracı bağlamı olmadan koşar.
 */
@Injectable()
export class ExternalInviteDispatcher {
  private readonly logger = new Logger(ExternalInviteDispatcher.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  async dispatch(now: Date = new Date()): Promise<DispatchReport> {
    const report: DispatchReport = { cap: { cap: 0, braked: null }, sent: 0, deferred: 0, cancelled: 0, reminders: 0 };

    // Kapanmış / iptal edilmiş talebin bekleyen davetleri artık gitmez.
    const closed = await this.prisma.externalListingInvite.updateMany({
      where: { state: "QUEUED", listing: { status: { notIn: ["OPEN", "DRAFT"] } } },
      data: { state: "CANCELLED", cancelReason: "LISTING_CLOSED" },
    });
    report.cancelled += closed.count;

    report.cap = await this.dailyCap(now);
    let remaining = report.cap.cap - (await this.sentToday(now));
    if (report.cap.braked) {
      this.logger.warn(`cold invite brake (${report.cap.braked}): cap=${report.cap.cap}`);
    }
    if (remaining <= 0) return report;

    const due = (await this.prisma.externalListingInvite.findMany({
      // İptal edilmiş bağlantı jetonunun kuyruğu gitmez (iptal kuyruğu da düşürür; yarışa karşı).
      where: { state: "QUEUED", sendAfter: { lte: now }, listing: sendableListingWhere(now), referralInvite: { status: { not: "CANCELLED" } } },
      orderBy: { sendAfter: "asc" },
      take: DUE_BATCH,
      select: DUE_SELECT,
    })) as unknown as DueInvite[];

    const byEmail = new Map<string, DueInvite[]>();
    for (const inv of due) {
      const list = byEmail.get(inv.email) ?? [];
      list.push(inv);
      byEmail.set(inv.email, list);
    }

    const builder = new InviteContentBuilder(this.prisma, resolveWebUrl(this.config), this.translations);
    for (const [email, group] of byEmail) {
      if (remaining <= 0) break;
      const out = await this.processAddress(email, group, now, builder);
      report.sent += out.sent ? 1 : 0;
      report.deferred += out.deferred;
      report.cancelled += out.cancelled;
      if (out.sent) remaining--;
    }

    if (remaining > 0) report.reminders = await this.sendReminders(now, remaining, builder);
    return report;
  }

  /** Bugün (UTC) giden davet e-postası — tavan sayımı. */
  private sentToday(now: Date): Promise<number> {
    return this.prisma.emailLog.count({
      where: { contextType: INVITE_CONTEXT, status: { not: "FAILED" }, queuedAt: { gte: utcDayStart(now) } },
    });
  }

  /** Bugünkü platform tavanı + gönderilen (yönetici büyüme ekranı da okur). */
  async capStatus(now: Date = new Date()): Promise<ColdInviteCap & { sentToday: number }> {
    const [cap, sentToday] = await Promise.all([this.dailyCap(now), this.sentToday(now)]);
    return { ...cap, sentToday };
  }

  private async dailyCap(now: Date): Promise<ColdInviteCap> {
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const dayStart = utcDayStart(now);
    const yesterday = new Date(dayStart.getTime() - DAY_MS);
    const base = { contextType: INVITE_CONTEXT };
    const [first, sent7d, complaints7d, hardBounces7d, sentYesterday, peak] = await Promise.all([
      this.prisma.emailLog.findFirst({
        where: { ...base, status: { not: "FAILED" } },
        orderBy: { queuedAt: "asc" },
        select: { queuedAt: true },
      }),
      this.prisma.emailLog.count({ where: { ...base, status: { not: "FAILED" }, queuedAt: { gte: weekAgo } } }),
      this.prisma.emailLog.count({ where: { ...base, complainedAt: { gte: weekAgo } } }),
      this.prisma.emailLog.count({ where: { ...base, bounceType: "hard", bouncedAt: { gte: weekAgo } } }),
      this.prisma.emailLog.count({
        where: { ...base, status: { not: "FAILED" }, queuedAt: { gte: yesterday, lt: dayStart } },
      }),
      // Son 7 günün en yoğun UTC günü (ısınma gerçek hacme bağlı — B5-14).
      this.prisma.$queryRaw<{ peak: number | bigint | null }[]>`
        SELECT MAX(c) AS peak FROM (
          SELECT COUNT(*) AS c FROM "email_logs"
          WHERE "contextType" = ${INVITE_CONTEXT} AND "status" <> 'FAILED' AND "queuedAt" >= ${weekAgo}
          GROUP BY date_trunc('day', "queuedAt" AT TIME ZONE 'UTC')
        ) t`,
    ]);
    const peakDay7d = Number(peak[0]?.peak ?? 0);
    // Tanımsız/boş → varsayılan; 0 GEÇERLİ (soğuk daveti durdurma anahtarı).
    // Eskiden `v > 0` 0'ı yok sayıp varsayılana düşüyordu (yayın denetimi
    // 2026-09-28 Bölüm 5).
    const num = (key: string) => {
      const raw = this.config.get<string>(key)?.toString().trim();
      if (!raw) return undefined;
      const v = Number(raw);
      return Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    return coldInviteDailyCap(
      { firstSentAt: first?.queuedAt ?? null, sent7d, complaints7d, hardBounces7d, sentYesterday, peakDay7d },
      now,
      { base: num("COLD_INVITE_BASE_DAILY"), max: num("COLD_INVITE_MAX_DAILY") },
    );
  }

  /** Adresin davet geçmişi (90 gün) + ilgi sinyali + engeller. */
  private async addressState(email: string, now: Date) {
    const since = new Date(now.getTime() - INVITE_PAUSE_WINDOW_DAYS * DAY_MS);
    const [optOut, user, history, clicked] = await Promise.all([
      this.prisma.referralOptOut.findUnique({ where: { email }, select: { email: true } }),
      this.prisma.companyUser.findFirst({ where: { email, deletedAt: null }, select: { id: true } }),
      this.prisma.emailLog.findMany({
        where: { toEmail: email, contextType: INVITE_CONTEXT, status: { not: "FAILED" }, queuedAt: { gte: since } },
        orderBy: { queuedAt: "desc" },
        select: { queuedAt: true },
      }),
      this.prisma.companyReferralInvite.findFirst({
        where: { email, lastClickedAt: { gte: since } },
        select: { id: true },
      }),
    ]);
    return {
      optedOut: !!optOut,
      registered: !!user,
      lastInviteEmailAt: history[0]?.queuedAt ?? null,
      sends90d: history.length,
      engaged: !!clicked,
    };
  }

  private async cancel(ids: string[], reason: string): Promise<number> {
    if (ids.length === 0) return 0;
    const r = await this.prisma.externalListingInvite.updateMany({
      where: { id: { in: ids }, state: "QUEUED" },
      data: { state: "CANCELLED", cancelReason: reason },
    });
    return r.count;
  }

  private async processAddress(
    email: string,
    group: DueInvite[],
    now: Date,
    builder: InviteContentBuilder,
  ): Promise<{ sent: boolean; deferred: number; cancelled: number }> {
    const out = { sent: false, deferred: 0, cancelled: 0 };
    const state = await this.addressState(email, now);
    if (state.optedOut) {
      out.cancelled += await this.cancel(group.map((g) => g.id), "OPTED_OUT");
      return out;
    }
    // Kayıt olmuş adres: kayıt anında davetler talebe bağlandı (acceptReferralInvites).
    if (state.registered) {
      out.cancelled += await this.cancel(group.map((g) => g.id), "REGISTERED");
      return out;
    }

    const sendable: DueInvite[] = [];
    for (const inv of group) {
      if (invitePaused({ engaged: state.engaged, unengagedSends90d: state.sends90d, source: inv.source })) {
        out.cancelled += await this.cancel([inv.id], "PAUSED");
        continue;
      }
      const hold = inviteHoldUntil({
        source: inv.source,
        engaged: state.engaged,
        lastInviteEmailAt: state.lastInviteEmailAt,
        now,
      });
      if (!hold) {
        sendable.push(inv);
        continue;
      }
      const next = nextBusinessWindow(hold, timeZoneForCountry(inv.country));
      const closesAt = inv.listing.closesAt;
      // Beklenecek süre talebin kapanışını aşıyorsa e-posta gitmez; davet
      // kaydı kalır (adres kayıt olursa talebe yine bağlanır).
      if (closesAt && next.getTime() > closesAt.getTime() - 12 * HOUR_MS) {
        out.cancelled += await this.cancel([inv.id], "FREQUENCY");
        continue;
      }
      await this.prisma.externalListingInvite.update({ where: { id: inv.id }, data: { sendAfter: next } });
      out.deferred++;
    }
    if (sendable.length === 0) return out;

    // Alıcının dilinde çeviri: gelmediyse (10 dk'ya dek) kısa erteleme. AI
    // kapalıysa çeviri HİÇ gelmez → beklenmez, özgün metin hemen gider
    // (yayın denetimi 2026-09-28 Bölüm 6: kaynak dildeki davetler de 10 dk
    // bekliyordu — `ensureTranslated` kapalı serviste kaynak dili denetlemeden
    // `false` döner).
    const ready: DueInvite[] = [];
    for (const inv of sendable) {
      const locale = (isLocale(inv.locale) ? inv.locale : "tr") as Locale;
      const translated =
        this.translations && this.translations.enabled !== false
          ? await this.translations.ensureTranslated("LISTING", inv.listingId, [locale], 1_500).catch(() => false)
          : true;
      if (!translated && now.getTime() - inv.createdAt.getTime() < TRANSLATION_GRACE_MS) {
        await this.prisma.externalListingInvite.update({
          where: { id: inv.id },
          data: { sendAfter: new Date(now.getTime() + 2 * 60_000) },
        });
        out.deferred++;
        continue;
      }
      ready.push(inv);
    }
    if (ready.length === 0) return out;

    const batch = ready.slice(0, INVITE_DIGEST_MAX);
    const sent = await this.sendBatch(email, batch, builder, false);
    if (sent === "SENT") {
      out.sent = true;
      await this.prisma.externalListingInvite.updateMany({
        where: { id: { in: batch.map((b) => b.id) } },
        data: { state: "SENT", sentAt: now },
      });
      // Davet bağlantısının 30 günlük ömrü son gönderimden sayılır.
      await this.prisma.companyReferralInvite.updateMany({
        where: { id: { in: [...new Set(batch.map((b) => b.referralInviteId))] } },
        data: { updatedAt: now },
      });
    } else if (sent === "SUPPRESSED") {
      out.cancelled += await this.cancel(batch.map((b) => b.id), "SUPPRESSED");
    } else {
      for (const b of batch) {
        const attempts = b.attempts + 1;
        await this.prisma.externalListingInvite.update({
          where: { id: b.id },
          data:
            attempts >= INVITE_MAX_ATTEMPTS
              ? { attempts, state: "FAILED" }
              : { attempts, sendAfter: new Date(now.getTime() + INVITE_RETRY_MINUTES * 60_000) },
        });
      }
      out.deferred += batch.length;
    }
    return out;
  }

  /**
   * Tekli davet → `tender_external_invite` (gönderen "ABC İnşaat (Rothern
   * üzerinden)"); birden çok → `tender_invite_digest`. Her talep bağlantısı o
   * davet edenin jetonunu taşır.
   */
  private async sendBatch(
    email: string,
    batch: DueInvite[],
    builder: InviteContentBuilder,
    reminder: boolean,
  ): Promise<"SENT" | "SUPPRESSED" | "FAILED"> {
    const baseUrl = resolveWebUrl(this.config);
    const first = batch[0]!;
    const locale = (isLocale(first.locale) ? first.locale : "tr") as Locale;
    const registerUrl = (inv: DueInvite) =>
      appRoutes.signupWithRef(baseUrl, inv.referralInvite.token, locale, `/company/ilan/${inv.listingId}`);
    const previewUrl = (inv: DueInvite) => appRoutes.invitePreview(baseUrl, inv.referralInvite.token, inv.listingId, locale);
    const optOutUrl = appRoutes.optOut(baseUrl, first.referralInvite.token, locale);
    try {
      if (batch.length === 1) {
        const { showName, ...content } = await builder.content(first.listing, locale);
        const res = await this.email.send({
          to: { email },
          locale,
          // Ad gizliyse gönderen varsayılan ("Rothern").
          ...(showName ? { fromName: inviteFromName(content.inviterName, locale) } : {}),
          templateData: {
            template: "tender_external_invite",
            data: {
              ...content,
              registerUrl: registerUrl(first),
              previewUrl: previewUrl(first),
              optOutUrl,
              ...(reminder ? { reminder: true } : {}),
            },
          },
          context: { type: INVITE_CONTEXT, id: first.id },
        });
        return res.sent ? "SENT" : "SUPPRESSED";
      }
      const entries: TenderInviteDigestEntry[] = [];
      for (const inv of batch) {
        const c = await builder.content(inv.listing, locale);
        entries.push({
          inviterName: c.inviterName,
          tenderTitle: c.tenderTitle,
          tenderNumber: c.tenderNumber,
          closesAt: c.closesAt,
          deliveryPlace: c.deliveryPlace,
          items: c.items,
          itemCount: c.itemCount,
          // Özette kart "görüntüle ve teklif ver" → önizleme (oradan kayıt).
          ctaUrl: previewUrl(inv),
        });
      }
      const res = await this.email.send({
        to: { email },
        locale,
        templateData: { template: "tender_invite_digest", data: { invites: entries, optOutUrl } },
        context: { type: INVITE_CONTEXT, id: first.id },
      });
      return res.sent ? "SENT" : "SUPPRESSED";
    } catch (err) {
      this.logger.error(
        `invite send failed (${first.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return "FAILED";
    }
  }

  /**
   * Kapanıştan önce TEK hatırlatma: e-postası gitmiş, adres kayıt olmamış ve
   * çıkmamış; son 48 saatte başka davet e-postası almamış.
   */
  private async sendReminders(now: Date, budget: number, builder: InviteContentBuilder): Promise<number> {
    const candidates = (await this.prisma.externalListingInvite.findMany({
      where: {
        state: "SENT",
        reminderSentAt: null,
        sentAt: { lte: new Date(now.getTime() - DAY_MS) },
        listing: {
          ...sendableListingWhere(now),
          closesAt: {
            gt: new Date(now.getTime() + REMINDER_MIN_LEFT_HOURS * HOUR_MS),
            lte: new Date(now.getTime() + REMINDER_BEFORE_CLOSE_HOURS * HOUR_MS),
          },
        },
      },
      orderBy: { sentAt: "asc" },
      take: Math.min(budget * 2, DUE_BATCH),
      select: { ...DUE_SELECT, sentAt: true, reminderSentAt: true },
    })) as unknown as Array<DueInvite & { sentAt: Date | null; reminderSentAt: Date | null }>;

    let sent = 0;
    const seen = new Set<string>();
    for (const inv of candidates) {
      if (sent >= budget) break;
      if (seen.has(inv.email)) continue;
      seen.add(inv.email);
      if (!reminderDue({ closesAt: inv.listing.closesAt, sentAt: inv.sentAt, reminderSentAt: inv.reminderSentAt, now })) {
        continue;
      }
      const st = await this.addressState(inv.email, now);
      if (st.optedOut || st.registered) continue;
      if (st.lastInviteEmailAt && now.getTime() - st.lastInviteEmailAt.getTime() < 2 * DAY_MS) continue;
      const res = await this.sendBatch(inv.email, [inv], builder, true);
      if (res === "FAILED") continue;
      await this.prisma.externalListingInvite.update({ where: { id: inv.id }, data: { reminderSentAt: now } });
      if (res === "SENT") sent++;
    }
    return sent;
  }
}
