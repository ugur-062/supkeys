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
  AUTO_INVITE_OFF_REASON,
  AUTO_INVITE_OFF_WHERE,
  coldInviteDailyCap,
  coldInviteSendAt,
  INVITE_DIGEST_MAX,
  INVITE_MAX_ATTEMPTS,
  INVITE_PAUSE_WINDOW_DAYS,
  INVITE_RETRY_MINUTES,
  INVITE_WINDOW_JITTER_MINUTES,
  inviteHoldUntil,
  inviteMissesClosing,
  invitePaused,
  inviteQueueSendAt,
  queuedInviteForecast,
  REMINDER_EARLY_HOURS,
  REMINDER_MIN_LEFT_HOURS,
  registrationBlockedCountry,
  reminderLeavesNow,
  utcDayStart,
  type ColdInviteCap,
  type InviteSourceKind,
  type QueuedInviteForecast,
  type QueuedLetter,
  type QueuePlace,
} from "../../../common/company/external-invite-policy";
import {
  countryFromEmailDomain,
  nextBusinessWindow,
  timeZoneForCountry,
} from "../../../common/time/country-time-zone";
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
 * Sahiplenme kirası: adresin davetleri işlenmeden önce `sendAfter` bu kadar
 * ileri itilir (atomik, `state=QUEUED ∧ sendAfter<=now` koşuluyla). Aynı
 * anda koşan ikinci bir tur (kilit fail-open, çok örnek) aynı satırı alamaz;
 * süreç gönderim ortasında ölürse satır kira bitince yeniden denenir.
 * (Derin denetim MU-14.)
 */
const CLAIM_LEASE_MS = 10 * 60_000;

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

/**
 * A queued row the dispatcher reads when its turn comes: the request can be
 * sent for, the buyer has not cancelled the invitation link, and an automatic
 * invitation is still wanted. ONE definition for the dispatcher (`dueInvites`)
 * and for the forecast's letters ahead (`queuedInviteForecasts`): a row the
 * dispatcher would not read holds nobody. Read as of `now` - a request that
 * becomes sendable later (a draft that is published, an embargo that ends) is
 * not forecast.
 */
function readableQueueWhere(now: Date): Prisma.ExternalListingInviteWhereInput {
  return {
    state: "QUEUED",
    listing: sendableListingWhere(now),
    // İptal edilmiş bağlantı jetonunun kuyruğu gitmez (iptal kuyruğu da düşürür; yarışa karşı).
    referralInvite: { status: { not: "CANCELLED" } },
    // Özele çevrilen / kutusu kapatılan talebin otomatik daveti okunmaz
    // (dağıtıcı turun başında iptal eder; o iptalden SONRA çevrilen talebin
    // satırı sonraki turda düşer).
    NOT: AUTO_INVITE_OFF_WHERE,
  };
}

/** Bir turda geri alınan en fazla düşmüş otomatik davet (bkz. `resumeAutoInvites`). */
const RESUME_BATCH = 300;

/** Reminder candidates read per page of the scan (`sendReminders`). */
const REMINDER_SCAN_PAGE = DUE_BATCH;

/**
 * What the reminder scan reads of a candidate: enough to decide whether its
 * reminder may leave now. The letter's content (`DUE_SELECT`: the request with
 * its items) is loaded only for a row that is about to be sent.
 */
const REMINDER_SCAN_SELECT = {
  id: true,
  email: true,
  country: true,
  source: true,
  sentAt: true,
  listing: { select: { closesAt: true } },
} as const;

type ReminderCandidate = {
  id: string;
  email: string;
  country: string | null;
  source: InviteSourceKind;
  sentAt: Date | null;
  listing: { closesAt: Date | null };
};

/** Letters that wait for the same window start do not all leave in its first minute. */
const windowJitter = () => Math.floor(Math.random() * INVITE_WINDOW_JITTER_MINUTES);

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

/** Adresin davet geçmişi (90 gün) + ilgi sinyali — 7 gün freni ve duraklatma bununla. */
export interface InviteAddressHistory {
  lastInviteEmailAt: Date | null;
  sends90d: number;
  engaged: boolean;
}

/**
 * Adreslerin davet geçmişi — TEK KAYNAK (dağıtıcı gönderim kararı + keşif
 * turunun sonuç mesajı; gözden geçirme AI-6). Adrese giden referral (bağlantı
 * daveti) e-postası da davet geçmişidir: yalnız talep davetleri sayılınca aynı
 * adrese referral ertesi gün AI talep daveti gidebiliyordu (derin denetim LU-07).
 */
export async function inviteAddressHistories(
  prisma: Pick<PrismaBypassService, "emailLog" | "companyReferralInvite">,
  emails: readonly string[],
  now: Date,
): Promise<Map<string, InviteAddressHistory>> {
  const out = new Map<string, InviteAddressHistory>(
    emails.map((e) => [e, { lastInviteEmailAt: null, sends90d: 0, engaged: false }]),
  );
  if (emails.length === 0) return out;
  const since = new Date(now.getTime() - INVITE_PAUSE_WINDOW_DAYS * DAY_MS);
  const [history, clicked] = await Promise.all([
    prisma.emailLog.findMany({
      where: {
        toEmail: { in: [...emails] },
        contextType: { in: [INVITE_CONTEXT, "referral_invite"] },
        status: { not: "FAILED" },
        queuedAt: { gte: since },
      },
      orderBy: { queuedAt: "desc" },
      select: { toEmail: true, queuedAt: true },
    }),
    prisma.companyReferralInvite.findMany({
      where: { email: { in: [...emails] }, lastClickedAt: { gte: since } },
      select: { email: true },
    }),
  ]);
  for (const h of history) {
    const row = out.get(h.toEmail);
    if (!row) continue;
    row.sends90d++;
    // En yeni önce sıralı: ilk görülen son gönderimdir.
    row.lastInviteEmailAt ??= h.queuedAt;
  }
  for (const c of clicked) {
    const row = out.get(c.email);
    if (row) row.engaged = true;
  }
  return out;
}

/**
 * FORECAST OF THE QUEUED LETTERS OF ONE REQUEST, by address - the ONE read
 * behind every surface that tells the buyer about a queued letter: the
 * creator's message, the status band, the "invited by e-mail" section and the
 * answer of the invitation request itself. The rule is the pure
 * `queuedInviteForecast` (`external-invite-policy.ts`, the counterpart of
 * `processAddress`); this function hands it what it needs to know:
 *  - the address's letters of the last 90 days and its interest signal;
 *  - the address's queued letters on OTHER requests of any buyer (review of
 *    AUTO-COUNT-1): the 7-day hold is per address, so a letter that leaves a
 *    few minutes earlier for another request holds this one - although nothing
 *    has been sent yet and the history is still empty;
 *  - for an address with enough of those letters to fill an e-mail
 *    (`INVITE_DIGEST_MAX`), this request's place in the dispatcher's order
 *    (review R8-3): the sixth letter of one planned time does not fit the
 *    e-mail and is held by it.
 *
 * Three queries for the whole request, none when `rows` is empty - never one
 * per row; a fourth only when an address is that crowded. Bypass client: the
 * reads span every buyer. `rows` = the QUEUED rows of `listing`.
 */
export async function queuedInviteForecasts(
  prisma: Pick<PrismaBypassService, "emailLog" | "companyReferralInvite" | "externalListingInvite">,
  rows: ReadonlyArray<QueuedLetter & { email: string }>,
  listing: { id: string; closesAt: Date | null },
  now: Date,
): Promise<Map<string, QueuedInviteForecast>> {
  const out = new Map<string, QueuedInviteForecast>();
  const emails = [...new Set(rows.map((r) => r.email))];
  if (emails.length === 0) return out;
  const [histories, others] = await Promise.all([
    inviteAddressHistories(prisma, emails, now),
    prisma.externalListingInvite.findMany({
      where: { ...readableQueueWhere(now), email: { in: emails }, listingId: { not: listing.id } },
      select: {
        id: true,
        createdAt: true,
        email: true,
        source: true,
        country: true,
        sendAfter: true,
        listing: { select: { closesAt: true } },
      },
    }),
  ]);
  const ahead = new Map<string, Array<QueuedLetter & QueuePlace & { closesAt: Date | null }>>();
  for (const o of others) {
    const list = ahead.get(o.email) ?? [];
    list.push({
      id: o.id,
      createdAt: o.createdAt,
      source: o.source,
      country: o.country,
      sendAfter: o.sendAfter,
      closesAt: o.listing.closesAt,
    });
    ahead.set(o.email, list);
  }
  // The row's own place matters only where the e-mail can be full.
  const crowded = emails.filter((email) => (ahead.get(email)?.length ?? 0) >= INVITE_DIGEST_MAX);
  const places = new Map<string, QueuePlace>();
  if (crowded.length > 0) {
    const own = await prisma.externalListingInvite.findMany({
      where: { listingId: listing.id, email: { in: crowded } },
      select: { id: true, createdAt: true, email: true },
    });
    for (const o of own) places.set(o.email, { id: o.id, createdAt: o.createdAt });
  }
  for (const r of rows) {
    out.set(
      r.email,
      queuedInviteForecast(
        { source: r.source, country: r.country, sendAfter: r.sendAfter, ...places.get(r.email) },
        histories.get(r.email),
        listing.closesAt,
        now,
        ahead.get(r.email),
      ),
    );
  }
  return out;
}

/**
 * PLANNED TIMES OF THE LETTERS THAT WAIT FOR AN ADDRESS, by address (closing
 * check 2026-10-10, DISC-N1): the queued rows the dispatcher will read
 * (`readableQueueWhere` - any request, any buyer) whose turn has not come yet.
 * What `inviteQueueSendAt` needs to let a new row join the letter the address
 * already has in its send window, so both leave as one e-mail.
 *
 * ONLY A LETTER THAT CAN STILL LEAVE (review R8-4): a letter whose request
 * closes before its planned time is dropped when that request closes
 * (`LISTING_CLOSED`) - the forecast calls it `CLOSES_FIRST` and ignores it.
 * Offered here, it was the earliest letter and so the one joined: the new row
 * then left alone at that time and held the later letter it should have
 * joined for 7 days. Same test as in `forecastFromHistory`.
 *
 * ONE query for all addresses of a call, none when `emails` is empty - never
 * one per row. Bypass client: the read spans every buyer.
 */
export async function waitingLetterTimes(
  prisma: Pick<PrismaBypassService, "externalListingInvite">,
  emails: readonly string[],
  now: Date,
): Promise<Map<string, Date[]>> {
  const out = new Map<string, Date[]>();
  if (emails.length === 0) return out;
  const rows = await prisma.externalListingInvite.findMany({
    // A window start is never in the past: a row that is already due is in no range a new row can join.
    where: { ...readableQueueWhere(now), email: { in: [...new Set(emails)] }, sendAfter: { gte: now } },
    select: { email: true, sendAfter: true, listing: { select: { closesAt: true } } },
  });
  for (const r of rows) {
    const closesAt = r.listing.closesAt;
    if (closesAt && r.sendAfter.getTime() >= closesAt.getTime()) continue;
    const list = out.get(r.email) ?? [];
    list.push(r.sendAfter);
    out.set(r.email, list);
  }
  return out;
}

export interface DispatchReport {
  cap: ColdInviteCap;
  sent: number;
  deferred: number;
  cancelled: number;
  reminders: number;
  /** Alıcı kararından döndüğü için yeniden kuyruğa alınan otomatik davet. */
  resumed: number;
}

/**
 * KAYITSIZ ADRESLERE TALEP DAVETİ GÖNDERİMİ — dakikalık iş (2026-09-27, Faz 0b).
 *
 * Kuyruktaki (`external_listing_invites`, QUEUED) davetleri kurallarla gönderir
 * (kurallar `external-invite-policy.ts`te, burada yalnız uygulanır):
 *  - talep YAYINDA değilse bekler; kapanmış/iptal talebin davetleri düşer
 *  - platform günlük tavanı (ölçüme bağlı ısınma + fren)
 *  - AI'ın bulduğu adrese yalnız alıcının ülkesinde hafta içi 09-16 — pencere
 *    GÖNDERİM ANINDA yeniden denetlenir (`coldInviteSendAt`, AUTO-HOURS-1)
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
    const report: DispatchReport = {
      cap: { cap: 0, braked: null },
      sent: 0,
      deferred: 0,
      cancelled: 0,
      reminders: 0,
      resumed: 0,
    };

    // Kapanmış / iptal edilmiş talebin bekleyen davetleri artık gitmez.
    const closed = await this.prisma.externalListingInvite.updateMany({
      where: { state: "QUEUED", listing: { status: { notIn: ["OPEN", "DRAFT"] } } },
      data: { state: "CANCELLED", cancelReason: "LISTING_CLOSED" },
    });
    report.cancelled += closed.count;

    // Talep özele çevrildi ya da otomatik arama kapatıldı → turun kuyruğa
    // aldığı davetler düşer (kayıt bağlamaz, ekran "iptal edildi" der).
    const autoOff = await this.prisma.externalListingInvite.updateMany({
      where: { state: "QUEUED", ...AUTO_INVITE_OFF_WHERE },
      data: { state: "CANCELLED", cancelReason: AUTO_INVITE_OFF_REASON },
    });
    report.cancelled += autoOff.count;
    // ...alıcı kararından döndüyse (talep yeniden herkese açık, kutu yeniden
    // açık) aynı satırlar geri alınır: kapat-aç hiçbir daveti kaybettirmez.
    report.resumed = await this.resumeAutoInvites(now);

    report.cap = await this.dailyCap(now);
    let remaining = report.cap.cap - (await this.sentToday(now));
    if (report.cap.braked) {
      this.logger.warn(`cold invite brake (${report.cap.braked}): cap=${report.cap.cap}`);
    }
    const due = await this.dueInvites(now);
    if (remaining <= 0) {
      // Nothing can leave now, but the planned time shown to the buyer stays true.
      report.deferred += await this.replanOutsideWindow(due, now);
      return report;
    }

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

  /**
   * Rows whose turn has come and whose request can be sent for (one run's
   * batch). The order is the order inside an address's e-mail, and it is
   * COMPLETE (review R8-3): rows that joined each other share one planned
   * time, and when more than `INVITE_DIGEST_MAX` of them come due together the
   * first five in this order leave - the forecast counts in the same order
   * (`QueuePlace`), so which row is told "not sent" is not left to chance.
   */
  private async dueInvites(now: Date): Promise<DueInvite[]> {
    return (await this.prisma.externalListingInvite.findMany({
      where: { ...readableQueueWhere(now), sendAfter: { lte: now } },
      orderBy: [{ sendAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: DUE_BATCH,
      select: DUE_SELECT,
    })) as unknown as DueInvite[];
  }

  /**
   * THE DAILY CAP IS USED UP (or set to 0): nothing is sent in this run, and
   * the rows keep their place. A row whose window has closed in the meantime
   * would keep a PAST `sendAfter` until the cap is released at 00:00 UTC, and
   * the request page would show that past time as the planned one. Such a row
   * is moved to the start of its next window here (AUTO-HOURS-1); a row whose
   * window is open now is left alone - it leaves as soon as the cap allows.
   *
   * No lease is taken: the conditional update is atomic and a second instance
   * finds the row already moved.
   */
  private async replanOutsideWindow(due: DueInvite[], now: Date): Promise<number> {
    const opensAtOf = (inv: DueInvite, engaged: boolean, jitterMinutes = 0) =>
      coldInviteSendAt({ source: inv.source, engaged, country: inv.country, at: now, jitterMinutes });
    // Rows that wait inside their window (the usual case while the cap is
    // used up) cost nothing more than the read above.
    const rows = due.filter((inv) => opensAtOf(inv, false).getTime() > now.getTime());
    if (rows.length === 0) return 0;
    const histories = await inviteAddressHistories(this.prisma, [...new Set(rows.map((r) => r.email))], now);
    const jitterByEmail = new Map<string, number>();
    let moved = 0;
    for (const inv of rows) {
      const jitter = jitterByEmail.get(inv.email) ?? windowJitter();
      jitterByEmail.set(inv.email, jitter);
      const opensAt = opensAtOf(inv, histories.get(inv.email)?.engaged ?? false, jitter);
      if (opensAt.getTime() <= now.getTime()) continue;
      const r = await this.prisma.externalListingInvite.updateMany({
        where: { id: inv.id, state: "QUEUED", sendAfter: { lte: now } },
        data: { sendAfter: opensAt },
      });
      moved += r.count;
    }
    return moved;
  }

  /**
   * KARARDAN DÖNÜŞ (2026-10-09, ikinci gözden geçirme A-3): alıcı kutuyu bir
   * an kapatıp yeniden açtı ya da talebi özele çevirip geri aldı. O arada
   * koşan tur satırları `AUTO_INVITE_OFF` ile düşürmüştü ve hiçbir şey onları
   * geri almıyordu — sonuç mesajı "sıraya alındı" demişti, e-posta hiç
   * gitmiyordu. Geçerlilik talebin O ANKİ hâlinden okunur (`AUTO_INVITE_OFF_WHERE`
   * ve tersi): talep yeniden herkese/bağlantılara açık VE kutu açıksa satır
   * yeniden kuyruğa girer.
   *
   * Yalnız turun kendi satırı (`AI_AUTO`), e-postası hiç gitmemiş ve bu nedenle
   * düşmüş olan; başka nedenle düşen (çıkış, 7 gün freni…) ve alıcının
   * bağlantısını iptal ettiği adres geri gelmez. Sırası geçmiş satır alıcının
   * ülkesindeki ilk mesai penceresine yeniden planlanır (AI davetinin saat
   * kuralı); gönderim frenlerinin hepsi yine `processAddress`te uygulanır.
   */
  private async resumeAutoInvites(now: Date): Promise<number> {
    const rows = await this.prisma.externalListingInvite.findMany({
      where: {
        state: "CANCELLED",
        cancelReason: AUTO_INVITE_OFF_REASON,
        source: "AI_AUTO",
        sentAt: null,
        referralInvite: { status: { not: "CANCELLED" } },
        listing: {
          status: "OPEN",
          visibility: { not: "PRIVATE" },
          aiDiscovery: true,
          OR: [{ closesAt: null }, { closesAt: { gt: now } }],
        },
      },
      orderBy: { id: "asc" },
      take: RESUME_BATCH,
      select: { id: true, email: true, country: true, sendAfter: true },
    });
    // A row whose turn has passed gets a NEW time, planned like a new row's
    // (`inviteQueueSendAt`, DISC-N1): it joins the letter its address already
    // has in that window - queued by another request, or resumed in this run -
    // instead of a minute of its own (two rows of one address that had ONE
    // planned time came back with two, and the second was then held 7 days).
    // One read for the batch, none when every row keeps its time.
    const overdue = (row: { sendAfter: Date }) => row.sendAfter.getTime() <= now.getTime();
    const waiting = await waitingLetterTimes(this.prisma, rows.filter(overdue).map((row) => row.email), now);
    const lettersOf = (email: string) => {
      const list = waiting.get(email) ?? [];
      waiting.set(email, list);
      return list;
    };
    for (const row of rows) if (!overdue(row)) lettersOf(row.email).push(row.sendAfter);
    let resumed = 0;
    for (const row of rows) {
      const sendAfter = overdue(row)
        ? inviteQueueSendAt({
            source: "AI_AUTO",
            country: row.country,
            at: now,
            jitterMinutes: windowJitter(),
            waiting: lettersOf(row.email),
          })
        : row.sendAfter;
      if (overdue(row)) lettersOf(row.email).push(sendAfter);
      // Koşullu: alıcı aynı adresi o an elle davet ettiyse (satır onun daveti
      // olarak canlandı) ya da ikinci bir örnek geri aldıysa dokunulmaz.
      const r = await this.prisma.externalListingInvite.updateMany({
        where: { id: row.id, state: "CANCELLED", cancelReason: AUTO_INVITE_OFF_REASON },
        data: { state: "QUEUED", cancelReason: null, sendAfter },
      });
      resumed += r.count;
    }
    return resumed;
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

  /**
   * Adresin davet geçmişi (90 gün) + ilgi sinyali + engeller.
   *
   * `registered` = adres DOĞRULANMIŞ bir hesabın adresi. E-postası
   * doğrulanmamış kayıt "kayıtlı" SAYILMAZ (arayüz testi 2026-10 code-auth-1
   * devamı): adresin sahibi olduğu kanıtlanmamış bir kayıt — başkasının
   * adresiyle açılmış da olabilir — o adrese giden davet e-postalarını
   * durduruyor, kuyruktaki satırları REGISTERED diye iptal ettiriyordu. Davet
   * ancak adres doğrulanınca hesaba bağlanır (`verifyEmail`), o ana dek adres
   * kayıtsız bir adres gibi davet almaya devam eder.
   */
  private async addressState(email: string, now: Date) {
    const [optOut, user, histories] = await Promise.all([
      this.prisma.referralOptOut.findUnique({ where: { email }, select: { email: true } }),
      this.prisma.companyUser.findFirst({
        where: { email, deletedAt: null, emailVerifiedAt: { not: null } },
        select: { id: true },
      }),
      inviteAddressHistories(this.prisma, [email], now),
    ]);
    return { optedOut: !!optOut, registered: !!user, ...histories.get(email)! };
  }

  private async cancel(ids: string[], reason: string): Promise<number> {
    if (ids.length === 0) return 0;
    const r = await this.prisma.externalListingInvite.updateMany({
      where: { id: { in: ids }, state: "QUEUED" },
      data: { state: "CANCELLED", cancelReason: reason },
    });
    return r.count;
  }

  /**
   * Adresin satırlarını TEK ifadede atomik sahiplenir; başka bir turun o an
   * işlediği (kirası süren) ya da artık QUEUED olmayan satır düşer. Grup bu
   * çağrının döndürdüğü satırlardan oluşur (derin denetim LU-33): eskiden
   * satırlar tek tek sahipleniyordu; kilidin fail-open olduğu çok örnekli
   * koşumda aynı anlık görüntüyü okuyan iki tur bir adresin satırlarını
   * bölüşüp o adrese aynı turda İKİ e-posta gönderebiliyordu. Tek UPDATE'te
   * ikinci tur satır kilidini bekler, koşulu yeniden değerlendirir ve kirası
   * süren satırları almaz.
   */
  private async claim(group: DueInvite[], now: Date): Promise<DueInvite[]> {
    if (group.length === 0) return [];
    const lease = new Date(now.getTime() + CLAIM_LEASE_MS);
    const ids = group.map((g) => g.id);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "external_listing_invites"
      SET "sendAfter" = ${lease}, "updatedAt" = ${new Date()}
      WHERE "id" = ANY(${ids}) AND "state" = 'QUEUED' AND "sendAfter" <= ${now}
      RETURNING "id"`;
    const won = new Set(rows.map((r) => r.id));
    return group.filter((g) => won.has(g.id));
  }

  private async processAddress(
    email: string,
    due: DueInvite[],
    now: Date,
    builder: InviteContentBuilder,
  ): Promise<{ sent: boolean; deferred: number; cancelled: number }> {
    const out = { sent: false, deferred: 0, cancelled: 0 };
    const claimed = await this.claim(due, now);
    if (claimed.length === 0) return out;
    // KAYDA KAPALI ÜLKE gönderim anında da denetlenir (derin denetim
    // 2026-09-29 MU-09, gözden geçirme): kuyruğa alma kapısından önce yazılmış
    // (ya da başka yoldan gelmiş) ABD/İran/... satırı bekleme süresi dolunca
    // yine giderdi; yasak gerekçesi tam bu gönderimleri kapsar.
    const blocked = claimed.filter((inv) => registrationBlockedCountry(inv.country, countryFromEmailDomain(email)));
    if (blocked.length > 0) out.cancelled += await this.cancel(blocked.map((b) => b.id), "COUNTRY_BLOCKED");
    const group = claimed.filter((inv) => !blocked.includes(inv));
    if (group.length === 0) return out;
    const state = await this.addressState(email, now);
    if (state.optedOut) {
      out.cancelled += await this.cancel(group.map((g) => g.id), "OPTED_OUT");
      return out;
    }
    // Kayıtlı (e-postası DOĞRULANMIŞ) adres: davetleri hesaba zaten bağlandı,
    // e-posta gerekmez. Bağlama iki aşamalıdır (`acceptReferralInvites`):
    // KAYITTA yalnız kullanılan davet jetonunun daveti, adrese gönderilmiş
    // diğer davetler E-POSTA DOĞRULANINCA (adres o an kanıtlanır). Doğrulanmamış
    // kayıt burada "kayıtlı" değildir (bkz. `addressState`) → daveti gider.
    if (state.registered) {
      out.cancelled += await this.cancel(group.map((g) => g.id), "REGISTERED");
      return out;
    }

    // RECIPIENT'S BUSINESS HOURS, RE-CHECKED AT SEND TIME (AUTO-HOURS-1). The
    // window was applied only when the row was queued; a row that became
    // sendable later (translation wait, stack down, daily cap released at
    // 00:00 UTC) left at once, also at night. `windowed(inv, at)` is the
    // earliest moment the letter may leave at or after `at`: `at` itself for a
    // typed address and for an address that opened an invitation link,
    // otherwise inside the recipient country's weekday 09-16 window. Every
    // `sendAfter` written below for a waiting row goes through it, so the
    // planned time the buyer sees is the time the letter really leaves.
    // One spread per address and run: the letters of one address that wait for
    // the same window keep ONE planned time and still leave in a single digest.
    const jitter = windowJitter();
    const windowed = (inv: DueInvite, at: Date) =>
      coldInviteSendAt({ source: inv.source, engaged: state.engaged, country: inv.country, at, jitterMinutes: jitter });

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
        const opensAt = windowed(inv, now);
        if (opensAt.getTime() <= now.getTime()) {
          sendable.push(inv);
          continue;
        }
        // Outside the window: not sent, planned for the next window start. A
        // request that closes before that drops the row then (LISTING_CLOSED).
        await this.prisma.externalListingInvite.update({ where: { id: inv.id }, data: { sendAfter: opensAt } });
        out.deferred++;
        continue;
      }
      const next = nextBusinessWindow(hold, timeZoneForCountry(inv.country));
      const closesAt = inv.listing.closesAt;
      // Beklenecek süre talebin kapanışını aşıyorsa e-posta gitmez; davet
      // kaydı kalır (adres kayıt olup e-postasını doğrularsa talebe yine bağlanır).
      if (inviteMissesClosing(next, closesAt)) {
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
        // The 2-minute step stays inside the window too: a step taken at 15:59
        // ends after hours, so the row is planned for the next window start
        // (by then the translation is there, or the grace period is over).
        await this.prisma.externalListingInvite.update({
          where: { id: inv.id },
          data: { sendAfter: windowed(inv, new Date(now.getTime() + 2 * 60_000)) },
        });
        out.deferred++;
        continue;
      }
      ready.push(inv);
    }
    if (ready.length === 0) return out;

    const batch = ready.slice(0, INVITE_DIGEST_MAX);
    const rest = ready.slice(INVITE_DIGEST_MAX);
    if (rest.length > 0) {
      // Özete sığmayanlar kirada beklemesin: sonraki turda sıradalar.
      await this.prisma.externalListingInvite.updateMany({
        where: { id: { in: rest.map((r) => r.id) }, state: "QUEUED" },
        data: { sendAfter: now },
      });
    }
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
    } else if (sent === "SUPPRESSED" || sent === "ALLOWLIST") {
      // `ALLOWLIST` (staging alıcı izin listesi, 2026-10-08): adres engelli
      // DEĞİL, bu ortamda gönderilmedi — yayın paneli/bant nedeni ayrı söyler
      // (eskiden o da SUPPRESSED yazılıyor, ekran "adres geri çevirdi" diyordu).
      out.cancelled += await this.cancel(batch.map((b) => b.id), sent);
    } else {
      for (const b of batch) {
        const attempts = b.attempts + 1;
        await this.prisma.externalListingInvite.update({
          where: { id: b.id },
          data:
            attempts >= INVITE_MAX_ATTEMPTS
              ? { attempts, state: "FAILED" }
              : { attempts, sendAfter: windowed(b, new Date(now.getTime() + INVITE_RETRY_MINUTES * 60_000)) },
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
  ): Promise<"SENT" | "SUPPRESSED" | "ALLOWLIST" | "FAILED"> {
    const outcome = (res: { sent: boolean; skipReason?: string }) =>
      res.sent ? ("SENT" as const) : res.skipReason === "allowlist" ? ("ALLOWLIST" as const) : ("SUPPRESSED" as const);
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
        return outcome(res);
      }
      const entries: TenderInviteDigestEntry[] = [];
      for (const inv of batch) {
        const c = await builder.content(inv.listing, locale);
        entries.push({
          inviterName: c.inviterName,
          // Konu satırı davet edenleri FİRMAYA göre sayar; adı gizli talepler
          // ayrı anahtar alır ki aynı firmanın adlı talebiyle birleşip
          // anonimliği ele vermesin (derin denetim LU-09).
          inviterKey: c.showName ? inv.listing.companyId : `anon:${inv.listing.companyId}`,
          inviterAnonymous: !c.showName,
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
      return outcome(res);
    } catch (err) {
      this.logger.error(
        `invite send failed (${first.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return "FAILED";
    }
  }

  /**
   * Kapanıştan önce TEK hatırlatma: e-postası gitmiş, adres kayıt olmamış
   * (doğrulanmış hesabı yok) ve çıkmamış; son 48 saatte başka davet e-postası
   * almamış. The reminder is one more cold letter, so it keeps the same send
   * window as the invitation (`coldInviteSendAt`, AUTO-HOURS-1). WHEN it may
   * leave is one rule, `reminderLeavesNow`: inside the 6-48 hour reminder
   * period in a minute of the recipient's window - or, when that period has no
   * such minute (it lies in the weekend), in the last window before it (R6-1).
   *
   * EVERY CANDIDATE IS LOOKED AT (round 6 review, R6-2; the scan rule of
   * MU-14). The candidates used to be cut to `budget * 2` rows, oldest first,
   * BEFORE the window was checked. A row whose window is closed is skipped
   * without being marked, so the same rows filled that batch every minute and
   * the reminders behind them never got their turn: a typed address behind two
   * waiting ones, Tokyo's whole business day behind three hundred European
   * rows. Now the candidates are read page by page (keyset on `sentAt, id`,
   * the order stays "oldest invitation first") until `budget` reminders are
   * sent or there is no candidate left. The scan reads a few columns
   * (`REMINDER_SCAN_SELECT`) and decides without a query; address checks are
   * ONE batch per page, and the letter's content is loaded only for a row that
   * is sent - a night's worth of waiting reminders costs one small query per
   * page a minute.
   */
  private async sendReminders(now: Date, budget: number, builder: InviteContentBuilder): Promise<number> {
    const where: Prisma.ExternalListingInviteWhereInput = {
      state: "SENT",
      reminderSentAt: null,
      sentAt: { lte: new Date(now.getTime() - DAY_MS) },
      // İptal edilmiş (davet eden vazgeçti / paketi düştü) ya da kabul
      // edilmiş jetonun hatırlatması gitmez — iptal SENT satırı SENT bırakır
      // ve bağlantı önizlemede 404 açardı (derin denetim MU-14).
      referralInvite: { status: "PENDING" },
      // Özele çevrilen / otomatik araması kapatılan talebe turun davet
      // ettiği adrese HATIRLATMA da gitmez (yeni bir e-posta olurdu).
      NOT: AUTO_INVITE_OFF_WHERE,
      listing: {
        ...sendableListingWhere(now),
        // Up to `REMINDER_EARLY_HOURS`: a reminder whose period has no window
        // minute leaves before the period (`reminderLeavesNow`).
        closesAt: {
          gt: new Date(now.getTime() + REMINDER_MIN_LEFT_HOURS * HOUR_MS),
          lte: new Date(now.getTime() + REMINDER_EARLY_HOURS * HOUR_MS),
        },
      },
    };
    // Candidates share countries and requests: the window is asked once per
    // (kind of address, country, moment) and run, not once per row.
    const windowAt = new Map<string, Date>();
    const sendAt = (c: ReminderCandidate, engaged: boolean, at: Date): Date => {
      const key = `${c.source}|${engaged}|${c.country ?? ""}|${at.getTime()}`;
      let answer = windowAt.get(key);
      if (!answer) {
        answer = coldInviteSendAt({ source: c.source, engaged, country: c.country, at });
        windowAt.set(key, answer);
      }
      return answer;
    };
    /** May the reminder leave now, for an address with / without an interest signal? */
    const leavesNow = (c: ReminderCandidate, engaged: boolean) =>
      reminderLeavesNow({
        closesAt: c.listing.closesAt,
        sentAt: c.sentAt,
        reminderSentAt: null,
        now,
        sendAt: (at) => sendAt(c, engaged, at),
      });

    let sent = 0;
    /** One reminder letter per address and run. */
    const tried = new Set<string>();
    let after: { sentAt: Date; id: string } | null = null;
    while (sent < budget) {
      const page = (await this.prisma.externalListingInvite.findMany({
        where: after
          ? { AND: [where, { OR: [{ sentAt: { gt: after.sentAt } }, { sentAt: after.sentAt, id: { gt: after.id } }] }] }
          : where,
        orderBy: [{ sentAt: "asc" }, { id: "asc" }],
        take: REMINDER_SCAN_PAGE,
        select: REMINDER_SCAN_SELECT,
      })) as unknown as ReminderCandidate[];
      if (page.length === 0) break;
      const last = page[page.length - 1]!;
      after = last.sentAt ? { sentAt: last.sentAt, id: last.id } : null;

      // Decided without a query: a row that could not leave now whatever its
      // address history says (window closed and not in the period, period not
      // reached, a country closed to registration).
      const possible = page.filter(
        (c) =>
          !registrationBlockedCountry(c.country, countryFromEmailDomain(c.email)) &&
          (leavesNow(c, false) || leavesNow(c, true)),
      );
      if (possible.length > 0) {
        // The address checks of the page in one batch (interest signal, last
        // invitation letter, opt-out, proven account) - not three queries per address.
        const emails = [...new Set(possible.map((c) => c.email))];
        const [histories, optOuts, users] = await Promise.all([
          inviteAddressHistories(this.prisma, emails, now),
          this.prisma.referralOptOut.findMany({ where: { email: { in: emails } }, select: { email: true } }),
          this.prisma.companyUser.findMany({
            where: { email: { in: emails }, deletedAt: null, emailVerifiedAt: { not: null } },
            select: { email: true },
          }),
        ]);
        const closed = new Set([...optOuts.map((o) => o.email), ...users.map((u) => u.email)]);
        for (const c of possible) {
          if (sent >= budget) break;
          if (tried.has(c.email) || closed.has(c.email)) continue;
          const history = histories.get(c.email);
          if (!leavesNow(c, history?.engaged ?? false)) continue;
          if (history?.lastInviteEmailAt && now.getTime() - history.lastInviteEmailAt.getTime() < 2 * DAY_MS) continue;
          tried.add(c.email);
          // The content is read now, and only if the row still waits for its
          // reminder (a second instance may have sent it in the meantime).
          const inv = (await this.prisma.externalListingInvite.findFirst({
            where: { id: c.id, state: "SENT", reminderSentAt: null },
            select: DUE_SELECT,
          })) as unknown as DueInvite | null;
          if (!inv) continue;
          const res = await this.sendBatch(inv.email, [inv], builder, true);
          if (res === "FAILED") continue;
          await this.prisma.externalListingInvite.update({ where: { id: inv.id }, data: { reminderSentAt: now } });
          if (res === "SENT") sent++;
        }
      }
      if (page.length < REMINDER_SCAN_PAGE || !after) break;
    }
    return sent;
  }
}
