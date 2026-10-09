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
  INVITE_DIGEST_MAX,
  INVITE_MAX_ATTEMPTS,
  INVITE_PAUSE_WINDOW_DAYS,
  INVITE_RETRY_MINUTES,
  inviteHoldUntil,
  inviteMissesClosing,
  invitePaused,
  REMINDER_BEFORE_CLOSE_HOURS,
  REMINDER_MIN_LEFT_HOURS,
  registrationBlockedCountry,
  reminderDue,
  utcDayStart,
  type ColdInviteCap,
  type InviteSourceKind,
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

/** Bir turda geri alınan en fazla düşmüş otomatik davet (bkz. `resumeAutoInvites`). */
const RESUME_BATCH = 300;

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
 * Kuyruktaki davet e-postası talep kapanmadan GİDEBİLİR Mİ? Dağıtıcının
 * `processAddress` kararının saf karşılığı (duraklatma → 7 gün freni → frenin
 * bittiği mesai penceresi kapanışa sığıyor mu); sonuç mesajı gidemeyecek adresi
 * "sıraya alındı" diye saymasın (gözden geçirme AI-6). Çıkış / kayıtlı adres /
 * platform tavanı gibi SONRADAN belli olan nedenler burada öngörülmez.
 */
export function queuedInviteCanLeave(
  row: { source: InviteSourceKind; country: string | null; sendAfter: Date },
  history: InviteAddressHistory | undefined,
  closesAt: Date | null,
  now: Date,
): boolean {
  const h = history ?? { lastInviteEmailAt: null, sends90d: 0, engaged: false };
  // Sırası talebin kapanışından sonra gelen satır kapanışta düşer (LISTING_CLOSED).
  if (closesAt && row.sendAfter.getTime() >= closesAt.getTime()) return false;
  if (invitePaused({ engaged: h.engaged, unengagedSends90d: h.sends90d, source: row.source })) return false;
  const hold = inviteHoldUntil({ source: row.source, engaged: h.engaged, lastInviteEmailAt: h.lastInviteEmailAt, now });
  if (!hold) return true;
  return !inviteMissesClosing(nextBusinessWindow(hold, timeZoneForCountry(row.country)), closesAt);
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
    if (remaining <= 0) return report;

    const due = (await this.prisma.externalListingInvite.findMany({
      // İptal edilmiş bağlantı jetonunun kuyruğu gitmez (iptal kuyruğu da düşürür; yarışa karşı).
      // `NOT AUTO_INVITE_OFF_WHERE`: yukarıdaki iptalden SONRA özele çevrilen
      // talebin satırı da bu turda okunmaz (sonraki tur iptal eder).
      where: {
        state: "QUEUED",
        sendAfter: { lte: now },
        listing: sendableListingWhere(now),
        referralInvite: { status: { not: "CANCELLED" } },
        NOT: AUTO_INVITE_OFF_WHERE,
      },
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
      select: { id: true, country: true, sendAfter: true },
    });
    let resumed = 0;
    for (const row of rows) {
      const sendAfter =
        row.sendAfter.getTime() > now.getTime()
          ? row.sendAfter
          : nextBusinessWindow(now, timeZoneForCountry(row.country), Math.floor(Math.random() * 45));
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
   * almamış.
   */
  private async sendReminders(now: Date, budget: number, builder: InviteContentBuilder): Promise<number> {
    const candidates = (await this.prisma.externalListingInvite.findMany({
      where: {
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
      if (registrationBlockedCountry(inv.country, countryFromEmailDomain(inv.email))) continue;
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
