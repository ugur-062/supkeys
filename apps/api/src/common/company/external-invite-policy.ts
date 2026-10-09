import type { Prisma } from "@rothern/db";
import { REGISTRATION_BLOCKED } from "@rothern/shared";
import {
  BUSINESS_END_HOUR,
  BUSINESS_START_HOUR,
  nextBusinessWindow,
  timeZoneForCountry,
} from "../time/country-time-zone";

/**
 * KAYITSIZ ADRESE DAVET POLİTİKASI — tek kaynak, saf fonksiyonlar (2026-09-27).
 *
 * Kullanıcı kararı: "daha fazla firmaya gönderelim, aynı kişiye sık değil".
 * Soğuk davet e-postası şikâyet alırsa itibar düşer ve Gmail tüm alan adının
 * postasını spam'e atabilir; kurallar bunu önlerken toplam hacmi büyütür:
 *
 *  1. PLATFORM GÜNLÜK TAVANI ölçüme bağlı büyür: ilk hafta `base`, sorunsuz
 *     geçen her hafta iki katı (`max`a kadar). Son 7 günde şikâyet oranı
 *     %0,1'i ya da kalıcı geri dönme %2'yi aşarsa FREN: dünün yarısı.
 *  2. ADRES BAŞINA 7 GÜN: kayıtsız bir adrese (tüm alıcılar toplamında) 7 günde
 *     en fazla bir davet e-postası. Bekleyen davetler kaybolmaz — bir sonraki
 *     e-postada BİRLİKTE gider ("3 alıcı sizden teklif istiyor").
 *  3. İLGİ GEVŞETİR: davet bağlantısını açmış adrese fren uygulanmaz.
 *  4. ELLE YAZILAN ADRES (MANUAL) beklemez — alıcı o tedarikçiyi tanıyor.
 *  5. ÜÇ YANITSIZ E-POSTA: ilgi göstermeyen adrese 90 günde 3 davet e-postası
 *     gittiyse yenileri gönderilmez (kayıt kalır, kayıt olursa talebe bağlanır).
 */
export const INVITE_HOLD_DAYS = 7;
/**
 * B2B'de de ÖNCEDEN ONAY isteyen ülkeler (Almanya UWG §7, Kanada CASL) —
 * AI'ın bulduğu adrese soğuk davet GİTMEZ (kullanıcı kararı 2026-09-27, hukuk
 * görüşü gelene dek). Elle yazılan adres (alıcı tanıyor) etkilenmez; AI keşfi
 * bu ülkelerde aramaz.
 */
export const COLD_INVITE_CONSENT_COUNTRIES: ReadonlySet<string> = new Set(["DE", "CA"]);

/**
 * Hukuki kapı TEMKİNLİ okunur (yayın denetimi 2026-09-28 B5-12): ülke ipuçlarından
 * HERHANGİ biri (modelin etiketi, e-posta ya da site uzantısı) onay isteyen
 * ülkeyi gösteriyorsa davet gitmez. Eskiden yalnız etikete bakılıyordu —
 * etiketsiz ya da yanlış etiketli ("AT") `einkauf@firma.de` geçiyordu.
 */
export function coldInviteBlockedByCountry(
  source: InviteSourceKind,
  ...countryHints: ReadonlyArray<string | null | undefined>
): boolean {
  return source !== "MANUAL" && isConsentCountry(...countryHints);
}

export function isConsentCountry(...countryHints: ReadonlyArray<string | null | undefined>): boolean {
  return countryHints.some((c) => !!c && COLD_INVITE_CONSENT_COUNTRIES.has(c.trim().toUpperCase()));
}
/**
 * KAYDA KAPALI ÜLKE (`REGISTRATION_BLOCKED`: ABD + toprakları, İran, K. Kore,
 * Suriye, Küba) — davet e-postası HİÇBİR kaynaktan gitmez, AI keşfi bu
 * ülkelerde aramaz (derin denetim 2026-09-29 X24). Davetli kayıt olamaz
 * (onboarding ülkeyi reddeder) ve yasak gerekçesi (ABD'li e-posta/altyapı
 * sağlayıcılarının koşulları) tam da bu e-postaları kapsar. Onay kapısı gibi
 * TEMKİNLİ: ipuçlarından HERHANGİ biri kapalı ülkeyi gösteriyorsa kapanır.
 */
export function registrationBlockedCountry(...countryHints: ReadonlyArray<string | null | undefined>): boolean {
  return countryHints.some((c) => !!c && REGISTRATION_BLOCKED.has(c.trim().toUpperCase()));
}
export const INVITE_PAUSE_WINDOW_DAYS = 90;
export const INVITE_PAUSE_AFTER_SENDS = 3;
/** Firma başına günlük talep daveti (tüm talepleri toplamı). */
export const COMPANY_DAILY_INVITE_CAP = 60;
/** Tek e-postada toplanan en fazla talep daveti. */
export const INVITE_DIGEST_MAX = 5;
/** Başarısız gönderim yeniden denemesi. */
export const INVITE_MAX_ATTEMPTS = 3;
export const INVITE_RETRY_MINUTES = 30;
/** Kapanıştan önce tek hatırlatma: kapanışa ≤ 48 saat ve ≥ 6 saat kala. */
export const REMINDER_BEFORE_CLOSE_HOURS = 48;
export const REMINDER_MIN_LEFT_HOURS = 6;
/**
 * How long before closing a reminder may leave EARLY (`reminderLeavesNow`:
 * the reminder period has no minute inside the recipient's send window). The
 * longest case is Friday 09:00 for a request that closes just before Monday
 * 15:00 = 78 hours; the rest is room for a clock change. The dispatcher reads
 * its reminder candidates up to this far before closing.
 */
export const REMINDER_EARLY_HOURS = 96;

export const DEFAULT_COLD_INVITE_BASE_DAILY = 150;
export const DEFAULT_COLD_INVITE_MAX_DAILY = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ColdInviteStats {
  /** Platformdan giden ilk davet e-postası (ısınmanın başlangıcı). */
  firstSentAt: Date | null;
  /** Son 7 günde gönderilen davet e-postası. */
  sent7d: number;
  complaints7d: number;
  hardBounces7d: number;
  /** Dün (UTC) gönderilen davet e-postası. */
  sentYesterday: number;
  /**
   * Son 7 günün EN YOĞUN tek (UTC) günündeki gönderim. Verilirse tavan gerçek
   * hacme bağlanır: en fazla bunun 2 katı (tabanın altına inmez).
   */
  peakDay7d?: number;
}

export interface ColdInviteCap {
  cap: number;
  braked: null | "complaints" | "bounces";
}

/** Oran ancak yeterli örnekte anlamlı; altında mutlak eşik. */
const MIN_SAMPLE = 100;

export function coldInviteDailyCap(
  stats: ColdInviteStats,
  now: Date,
  cfg: { base?: number; max?: number } = {},
): ColdInviteCap {
  // `COLD_INVITE_MAX_DAILY=0` (ya da taban 0) = soğuk daveti DURDUR anahtarı —
  // eskiden `Math.max(1, …)` 0'ı yutup varsayılan tavanla göndermeye devam
  // ediyordu (yayın denetimi 2026-09-28 Bölüm 5).
  if (cfg.max === 0 || cfg.base === 0) return { cap: 0, braked: null };
  // A CONFIGURED MAXIMUM ALWAYS CAPS (round 5, D15 / AI-OPS-1): the maximum
  // used to be raised to the base (`Math.max(base, max)`), so any
  // `COLD_INVITE_MAX_DAILY` between 1 and the base (150 by default) was
  // silently ignored - a stack set to 50 sent up to 150 a day. The maximum is
  // the operator's ceiling: when it is below the base, the base (first-week
  // value, warm-up floor and brake floor) comes down to it. Undefined = default.
  const max = Math.max(1, cfg.max ?? DEFAULT_COLD_INVITE_MAX_DAILY);
  const base = Math.min(max, Math.max(1, cfg.base ?? DEFAULT_COLD_INVITE_BASE_DAILY));
  const weeks = stats.firstSentAt ? Math.max(0, Math.floor((now.getTime() - stats.firstSentAt.getTime()) / (7 * DAY_MS))) : 0;
  // ISINMA HACME BAĞLI (yayın denetimi 2026-09-28 B5-14): takvim tek başına
  // yetmez — haftalarca az gönderen platformun tavanı yine ikiye katlanıp bir
  // günde binlere sıçrayabiliyordu (alıcı sağlayıcılar ani hacim artışını
  // itibar sinyali sayar). Tavan en fazla son 7 günün en yoğun gününün 2 katı.
  const byCalendar = Math.min(max, base * 2 ** Math.min(weeks, 20));
  const nominal =
    stats.peakDay7d == null ? byCalendar : Math.min(byCalendar, Math.max(base, 2 * stats.peakDay7d));

  const complaintsHigh =
    stats.sent7d >= MIN_SAMPLE ? stats.complaints7d / stats.sent7d > 0.001 : stats.complaints7d >= 2;
  const bouncesHigh =
    stats.sent7d >= MIN_SAMPLE ? stats.hardBounces7d / stats.sent7d > 0.02 : stats.hardBounces7d >= 5;
  if (complaintsHigh || bouncesHigh) {
    const braked = Math.max(Math.floor(base / 2), Math.floor(stats.sentYesterday / 2));
    return { cap: Math.min(nominal, braked), braked: complaintsHigh ? "complaints" : "bounces" };
  }
  return { cap: nominal, braked: null };
}

export type InviteSourceKind = "MANUAL" | "AI_FORM" | "AI_AUTO";

/**
 * Kuyruk satırının iptal nedeni: yayın sonrası keşif turunun kuyruğa aldığı
 * (`AI_AUTO`) davet, alıcı talebi ÖZELE çevirdiği ya da otomatik arama kutusunu
 * KAPATTIĞI için e-posta gitmeden düştü (gözden geçirme AI-1). Adres davet
 * EDİLMEDİ: kayıtta talebe bağlanmaz; alıcı aynı adresi kendisi davet ederse
 * satır yeniden kuyruğa girer.
 */
export const AUTO_INVITE_OFF_REASON = "AUTO_INVITE_OFF";

/**
 * OTOMATİK DAVET ARTIK GEÇERSİZ — TEK TANIM (2026-10-09, gözden geçirme AI-1;
 * ikinci gözden geçirme A-1). Yayın sonrası keşif turunun kuyruğa aldığı
 * (`AI_AUTO`) davet, alıcı talebi ÖZELE çevirdiyse ("yalnız seçtiğim firmalar")
 * ya da otomatik arama kutusunu KAPATTIYSA geçersizdir. Bu satırlar alıcının
 * mesai saatini (hafta sonu, 7 günlük adres freni) bekler — pencere saatler /
 * günler sürer ve o arada alıcı kararını değiştirebilir. Elle (`MANUAL`) ve
 * pencereden seçilerek (`AI_FORM`) gönderilen davet alıcının bilinçli
 * seçimidir, dokunulmaz (özel talebe adres davet edilebilir).
 *
 * Üç okuyucu AYNI tanımı kullanır, ayrışmasınlar:
 *  - dağıtıcı: kuyruktaki satırı düşürür, sırası gelmişi okumaz, hatırlatmayı
 *    göndermez (`ExternalInviteDispatcher`);
 *  - dağıtıcı: talep yeniden herkese açık + kutu açık olunca düşen satırı geri
 *    alır (tanımın TERSİ);
 *  - kayıt: e-postası HİÇ gitmemiş (`sentAt` boş) böyle bir satır adres
 *    kanıtlanınca talebe BAĞLANMAZ (`attachExternalListingInvites`) — satırın
 *    kuyruk durumu ne olursa olsun (bekliyor, başka nedenle düşmüş…).
 *
 * Yalnız tip: bu dosya saf kalır (Prisma çalışma zamanı içe aktarılmaz).
 */
export const AUTO_INVITE_OFF_WHERE: Prisma.ExternalListingInviteWhereInput = {
  source: "AI_AUTO",
  listing: { OR: [{ visibility: "PRIVATE" }, { aiDiscovery: false }] },
};

/**
 * DID THIS REQUEST'S INVITATION REACH THE ADDRESS, OR CAN IT STILL (round 5
 * review, R5-04)? A queue row is written for every invitation, whatever became
 * of it. Only a row that was sent or is still waiting says "this company is
 * invited to this request": a row that FAILED or was CANCELLED before it left
 * (hard bounce `SUPPRESSED`, staging `ALLOWLIST`, `AUTO_INVITE_OFF`...) reached
 * nobody, so it must not lock the OTHER mailboxes of that company - they are
 * the only way left to reach it. The exact address of such a row stays
 * "already invited" (the row exists; the buyer re-invites it by hand).
 *
 * Readers: `SupplierDiscoveryService.annotate` (company-level "already
 * invited") and the second discovery round (which earlier candidates still
 * exclude their whole company).
 */
export function inviteReachesAddress(row: { state: string; sentAt?: Date | null }): boolean {
  return row.state === "QUEUED" || row.state === "SENT" || !!row.sentAt;
}

/**
 * Bu adrese şimdi davet e-postası gidebilir mi? `null` = gidebilir; tarih =
 * o zamana dek bekle (7 gün freni).
 */
export function inviteHoldUntil(p: {
  source: InviteSourceKind;
  engaged: boolean;
  lastInviteEmailAt: Date | null;
  now: Date;
}): Date | null {
  if (p.source === "MANUAL" || p.engaged || !p.lastInviteEmailAt) return null;
  const until = new Date(p.lastInviteEmailAt.getTime() + INVITE_HOLD_DAYS * DAY_MS);
  return until > p.now ? until : null;
}

/** Spread of the letters that wait for the same window start (minutes). */
export const INVITE_WINDOW_JITTER_MINUTES = 45;

/**
 * SEND WINDOW OF A COLD INVITATION - single definition (live re-check
 * 2026-10-09, AUTO-HOURS-1). A letter to an address the AI found leaves only
 * on a weekday between 09:00 and 16:00 in the RECIPIENT's country (the screens
 * and the creator e-mail promise exactly this). Returns `at` when the letter
 * may leave at `at`, otherwise the start of the next window (+ jitter).
 *
 * The window used to be applied only when the row was QUEUED. A row that
 * became sendable later (it waited for a translation in 2-minute steps, the
 * stack was down, the platform's daily cap was reached and released at 00:00
 * UTC) left at once - 16:07 in Madrid, 03:00 in Istanbul. The dispatcher now
 * asks this function at SEND time, for every `sendAfter` it writes for a
 * waiting row, and for the reminder.
 *
 * Exempt, as at queue time and in the 7-day hold: an address the buyer typed
 * (`MANUAL` - the buyer knows that supplier) and an address that opened an
 * invitation link (`engaged`).
 *
 * `country` is the stored row value (label, else the e-mail's country
 * extension); unknown falls back to Istanbul (`timeZoneForCountry`).
 */
export function coldInviteSendAt(p: {
  source: InviteSourceKind;
  engaged: boolean;
  country: string | null | undefined;
  at: Date;
  jitterMinutes?: number;
}): Date {
  if (p.source === "MANUAL" || p.engaged) return p.at;
  return nextBusinessWindow(p.at, timeZoneForCountry(p.country), p.jitterMinutes ?? 0);
}

/**
 * Davet e-postası talebin kapanışından en az bu kadar önce çıkabilmeli; 7 gün
 * freni daha geç bitiyorsa e-posta HİÇ gitmez (kuyruk satırı `FREQUENCY` ile
 * düşer). Dağıtıcı ve "kaç davet e-postası sıraya alındı" sonuç mesajı
 * (gözden geçirme AI-6) AYNI kuralı okur.
 */
export const INVITE_MIN_HOURS_BEFORE_CLOSE = 12;

export function inviteMissesClosing(sendAt: Date, closesAt: Date | null): boolean {
  return !!closesAt && sendAt.getTime() > closesAt.getTime() - INVITE_MIN_HOURS_BEFORE_CLOSE * 3_600_000;
}

/** İlgi göstermeyen adrese yeterince yazıldı mı (duraklat)? */
export function invitePaused(p: { engaged: boolean; unengagedSends90d: number; source: InviteSourceKind }): boolean {
  if (p.engaged || p.source === "MANUAL") return false;
  return p.unengagedSends90d >= INVITE_PAUSE_AFTER_SENDS;
}

/** Tek hatırlatmanın zamanı geldi mi? */
export function reminderDue(p: {
  closesAt: Date | null;
  sentAt: Date | null;
  reminderSentAt: Date | null;
  now: Date;
}): boolean {
  if (!p.closesAt || !p.sentAt || p.reminderSentAt) return false;
  const left = p.closesAt.getTime() - p.now.getTime();
  if (left > REMINDER_BEFORE_CLOSE_HOURS * 3_600_000 || left < REMINDER_MIN_LEFT_HOURS * 3_600_000) return false;
  // İlk davetin hemen ardından hatırlatma olmaz.
  return p.now.getTime() - p.sentAt.getTime() >= DAY_MS;
}

/** Length of the send window of a cold letter (weekday 09:00-16:00 local). */
const SEND_WINDOW_MS = (BUSINESS_END_HOUR - BUSINESS_START_HOUR) * 3_600_000;

/**
 * MAY THE SINGLE REMINDER LEAVE NOW - `reminderDue` + the recipient's send
 * window (round 6 review, R6-1). `sendAt(at)` is the row's `coldInviteSendAt`:
 * the earliest moment at or after `at` this address may get a letter (`at`
 * itself for a typed address and for one that opened an invitation link).
 *
 *  - INSIDE THE REMINDER PERIOD (6-48 hours before closing): now, when the
 *    window is open now. Outside the window the reminder waits for a later
 *    minute of the period.
 *  - THE PERIOD HAS NO SUCH MINUTE: the period is 42 hours long and the window
 *    is closed from Friday 16:00 to Monday 09:00. A request that closes between
 *    Sunday 16:00 and Monday 15:00 (recipient time - 23 of the 168 closing
 *    hours of a week, e.g. the 7-day request created on a Monday morning) has
 *    its whole period in that gap: the reminder of an address the AI found
 *    never left (before the window was checked it left at the weekend). It now
 *    leaves in the LAST window before the period - that Friday, 09:00-16:00 -
 *    and not earlier: on Thursday the next window (Friday) is still ahead.
 *
 * A typed or engaged address has every minute of its period, so nothing
 * changes for it. "At least a day after the invitation" holds in both cases.
 *
 * `sendAt` is handed in, not called here: the caller binds the row (source,
 * interest signal, country), and suites that test another rule hold the window
 * open by replacing the module's `coldInviteSendAt` (`holdInviteSendWindowOpen`)
 * - a call from inside this file would not see that replacement.
 */
export function reminderLeavesNow(p: {
  closesAt: Date | null;
  sentAt: Date | null;
  reminderSentAt: Date | null;
  now: Date;
  sendAt: (at: Date) => Date;
}): boolean {
  if (!p.closesAt || !p.sentAt || p.reminderSentAt) return false;
  const now = p.now.getTime();
  // İlk davetin hemen ardından hatırlatma olmaz.
  if (now - p.sentAt.getTime() < DAY_MS) return false;
  const periodStart = p.closesAt.getTime() - REMINDER_BEFORE_CLOSE_HOURS * 3_600_000;
  const periodEnd = p.closesAt.getTime() - REMINDER_MIN_LEFT_HOURS * 3_600_000;
  // The period itself stays one definition (`reminderDue`).
  const inPeriod = reminderDue(p);
  // The period is over.
  if (!inPeriod && now >= periodStart) return false;
  // The window is closed now: wait.
  if (p.sendAt(p.now).getTime() > now) return false;
  if (inPeriod) return true;
  // Before the period: only when the period itself has no minute for this address...
  if (p.sendAt(new Date(periodStart)).getTime() <= periodEnd) return false;
  // ...and no later window opens before it. The window is open now, so one
  // window length ahead is past its end: `sendAt` gives the start of the NEXT one.
  return p.sendAt(new Date(now + SEND_WINDOW_MS)).getTime() > periodEnd;
}

export function utcDayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
