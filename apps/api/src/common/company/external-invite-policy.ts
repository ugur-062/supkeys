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
 * PLANNED TIME OF A LETTER THAT ENTERS THE QUEUE - single definition (closing
 * check 2026-10-10, DISC-N1). Rule 2 of this file: waiting invitations to one
 * address are not lost, they go out TOGETHER in the next e-mail. The dispatcher
 * builds that e-mail from the rows of an address that are due in the same run
 * - and every AI-sourced row used to get its own minute of the 0-45 minute
 * spread. Two requests that queued one address for Monday 09:32 and 09:33 were
 * two runs: the first letter left, the second was held 7 days and dropped
 * (`FREQUENCY`) because its request closed first - 3 of 14 letters in the live
 * data.
 *
 * A row planned for a send window JOINS the letter the address already has
 * there: it takes EXACTLY that letter's time, so both come due in one run and
 * leave as one e-mail. "There" = from the earliest moment this row may leave
 * (`at` itself inside the recipient's window, otherwise the next window start)
 * to the end of the spread (`INVITE_WINDOW_JITTER_MINUTES`) - the only range
 * the spread can put this row into, so the joined time is never earlier than
 * this row's own window and never later than its own spread could have been.
 * With several letters in that range the earliest is joined (the one certain
 * to leave on time). No letter there: the row is spread as before.
 *
 * THE JOINED TIME IS ITSELF INSIDE THIS ROW'S SEND WINDOW (review R8-1). The
 * range is 45 minutes long, so for a row queued in the last 45 minutes of its
 * window it ends after 16:00 local - and the address can have a letter there:
 * a typed letter on its retry (exempt from the window), a letter planned for
 * another country's window, a row under the dispatcher's claim lease. Joined
 * to it, the row was answered "queued, 16:20", found outside its window at
 * that minute, moved to the next window and dropped there by the 7-day hold
 * the other letter had just started. Such a time is not joined: the row is
 * due now, as it was before the rule.
 *
 * `waiting` = planned times of the address's queued letters the dispatcher
 * will read and that can still leave, on any request of any buyer
 * (`waitingLetterTimes`).
 *
 * An address the buyer typed (`MANUAL`) does not wait and joins nothing.
 * Readers: the queueing call (`inviteExternalForListing`, its revive branch
 * included) and the dispatcher's resume of a dropped automatic invitation -
 * every place that plans a NEW time with a spread. What the dispatcher does
 * with rows that are already apart is not changed.
 */
export function inviteQueueSendAt(p: {
  source: InviteSourceKind;
  country: string | null | undefined;
  at: Date;
  /** Spread of this row when the address has no letter to join (minutes). */
  jitterMinutes: number;
  waiting?: ReadonlyArray<Date>;
}): Date {
  if (p.source === "MANUAL") return p.at;
  const timeZone = timeZoneForCountry(p.country);
  const from = nextBusinessWindow(p.at, timeZone).getTime();
  const until = from + INVITE_WINDOW_JITTER_MINUTES * 60_000;
  let joined: number | null = null;
  for (const letter of p.waiting ?? []) {
    const t = letter.getTime();
    if (t < from || t > until || (joined !== null && t >= joined)) continue;
    // Only a minute this row may leave in: the range can end after the window does.
    if (nextBusinessWindow(letter, timeZone).getTime() === t) joined = t;
  }
  return joined === null ? nextBusinessWindow(p.at, timeZone, p.jitterMinutes) : new Date(joined);
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

/**
 * Why a queued letter will not leave. `PAUSED` and `FREQUENCY` are the cancel
 * reasons the dispatcher writes when the row's turn comes; `CLOSES_FIRST` = the
 * row's turn itself comes after the request closes (no hold involved - the row
 * is dropped as `LISTING_CLOSED` once the request is closed).
 */
export type QueuedInviteDropReason = "CLOSES_FIRST" | "PAUSED" | "FREQUENCY";

/** `leavesAt` = the moment the letter can really leave; `null` = it will not leave before the request closes. */
export type QueuedInviteForecast =
  | { leavesAt: Date; dropReason: null }
  | { leavesAt: null; dropReason: QueuedInviteDropReason };

/** What the forecast reads of a queued letter. */
export type QueuedLetter = { source: InviteSourceKind; country: string | null; sendAfter: Date };

/**
 * A row's place among the letters of its address that come due in ONE run:
 * the dispatcher reads them by planned time, then age, then id (`dueInvites`)
 * and puts the first `INVITE_DIGEST_MAX` into the e-mail. Optional on every
 * letter the forecast reads: without it nothing is said about the order.
 */
export type QueuePlace = { createdAt: Date; id: string };

/** Does `a` come before `b` in the dispatcher's order? `false` when either place is unknown. */
function readBefore(a: Partial<QueuePlace> & { leavesAt: Date }, b: Partial<QueuePlace> & { leavesAt: Date }): boolean {
  if (!a.createdAt || !a.id || !b.createdAt || !b.id) return false;
  const byTime = a.leavesAt.getTime() - b.leavesAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime();
  return byTime !== 0 ? byTime < 0 : a.id < b.id;
}

/** The address's letters of the last 90 days + its interest signal (`inviteAddressHistories`). */
type InviteHistory = { lastInviteEmailAt: Date | null; sends90d: number; engaged: boolean };

/**
 * WHAT WILL THE DISPATCHER DO WITH A QUEUED LETTER - single definition, pure
 * counterpart of `ExternalInviteDispatcher.processAddress` (pause -> 7-day
 * hold -> does the send window after the hold still fit before closing).
 *
 * ONE function for every place that tells the buyer about a queued letter
 * (live check 2026-10-10, AUTO-COUNT-1): the creator's notification and
 * e-mail ("N invitation e-mails queued"), the status band of the automatic run
 * and the "invited by e-mail" section of the request page. The message counted
 * with this rule while the two screens read the queue row alone: 9 "queued" on
 * screen against 6 in the message, three of them with a planned time that was
 * never going to be honoured.
 *
 *  - `leavesAt`: the stored `sendAfter`, or - for an address on the 7-day hold -
 *    the start of the send window after the hold ends (exactly the `sendAfter`
 *    the dispatcher writes when the row comes due).
 *  - `dropReason`: the letter will not leave before the request closes.
 *
 * The dispatcher looks at a row when its turn comes, so the hold is measured
 * at that moment (`sendAfter`, or now for a row that is already due): a hold
 * that ends before the row's turn changes nothing.
 *
 * A LETTER AHEAD IN THE QUEUE COUNTS TOO (`ahead`; review of AUTO-COUNT-1).
 * The 7-day hold is per ADDRESS, across requests and buyers, and two queued
 * rows of one address can have different planned minutes (a row now joins the
 * letter that waits in its window, `inviteQueueSendAt`; rows queued before
 * that rule, two calls in the same instant and a typed letter next to a found
 * one are still apart). Two requests that queue
 * the same address for Monday 09:10 and 09:22 are two turns: the dispatcher
 * sends the first and holds the second for 7 days. The history alone does not
 * show this - the first letter has not left yet - so all four surfaces said
 * "queued, Monday 09:22" for a row that was then dropped. `ahead` = the
 * address's queued letters on OTHER requests (`queuedLettersAhead`): the first
 * of them to leave, when it leaves before this row, is this row's last letter
 * (and one more of its 90-day sends). Letters planned for the same moment go
 * out as one e-mail, so an equal time holds nobody.
 *
 * ...UP TO `INVITE_DIGEST_MAX` LETTERS (review R8-3). Now that rows join each
 * other, more than five rows of one address can share one planned time. The
 * e-mail takes the first five in the dispatcher's order (`QueuePlace`); the
 * rest are read again a minute later and meet the hold of the letter that has
 * just left. A row with five letters of its own turn before it is forecast
 * exactly like that: held from that turn. The order is only known for rows
 * that carry their place; without it an equal time holds nobody, as before.
 *
 * Only that first letter is followed (it is the one certain to leave on time);
 * what the letters behind it then do to each other is not simulated. Reasons
 * that only show up later (opt-out, registered address, platform cap, a letter
 * queued after this read) are not forecast here.
 */
export function queuedInviteForecast(
  row: QueuedLetter & Partial<QueuePlace>,
  history: InviteHistory | undefined,
  closesAt: Date | null,
  now: Date,
  ahead: ReadonlyArray<QueuedLetter & Partial<QueuePlace> & { closesAt: Date | null }> = [],
): QueuedInviteForecast {
  const h = history ?? { lastInviteEmailAt: null, sends90d: 0, engaged: false };
  const own = forecastFromHistory(row, h, closesAt, now);
  if (!own.leavesAt || ahead.length === 0) return own;
  // A row that is already due leaves at the dispatcher's next run, not in the past.
  const turn = (leavesAt: Date) => Math.max(leavesAt.getTime(), now.getTime());
  const ownTurn = turn(own.leavesAt);
  let first: number | null = null;
  /** Letters of this row's own turn that the dispatcher puts into the e-mail before it. */
  let before = 0;
  for (const other of ahead) {
    const leavesAt = forecastFromHistory(other, h, other.closesAt, now).leavesAt;
    if (!leavesAt) continue;
    if (first === null || turn(leavesAt) < first) first = turn(leavesAt);
    if (turn(leavesAt) === ownTurn && readBefore({ ...other, leavesAt }, { ...row, leavesAt: own.leavesAt })) before++;
  }
  // The letter that starts this row's hold: one that leaves earlier, or - the e-mail of its own turn is full - that e-mail.
  const heldFrom = first !== null && first < ownTurn ? first : before >= INVITE_DIGEST_MAX ? ownTurn : null;
  if (heldFrom === null) return own;
  return forecastFromHistory(row, { ...h, lastInviteEmailAt: new Date(heldFrom), sends90d: h.sends90d + 1 }, closesAt, now);
}

/** The forecast of one letter from the address's history alone (`queuedInviteForecast` adds the queue). */
function forecastFromHistory(row: QueuedLetter, h: InviteHistory, closesAt: Date | null, now: Date): QueuedInviteForecast {
  if (closesAt && row.sendAfter.getTime() >= closesAt.getTime()) return { leavesAt: null, dropReason: "CLOSES_FIRST" };
  if (invitePaused({ engaged: h.engaged, unengagedSends90d: h.sends90d, source: row.source })) {
    return { leavesAt: null, dropReason: "PAUSED" };
  }
  const turn = row.sendAfter.getTime() > now.getTime() ? row.sendAfter : now;
  const hold = inviteHoldUntil({
    source: row.source,
    engaged: h.engaged,
    lastInviteEmailAt: h.lastInviteEmailAt,
    now: turn,
  });
  if (!hold) return { leavesAt: row.sendAfter, dropReason: null };
  const next = nextBusinessWindow(hold, timeZoneForCountry(row.country));
  return inviteMissesClosing(next, closesAt) ? { leavesAt: null, dropReason: "FREQUENCY" } : { leavesAt: next, dropReason: null };
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
