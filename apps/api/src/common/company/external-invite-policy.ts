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
  const base = Math.max(1, cfg.base ?? DEFAULT_COLD_INVITE_BASE_DAILY);
  const max = Math.max(base, cfg.max ?? DEFAULT_COLD_INVITE_MAX_DAILY);
  const weeks = stats.firstSentAt ? Math.max(0, Math.floor((now.getTime() - stats.firstSentAt.getTime()) / (7 * DAY_MS))) : 0;
  const nominal = Math.min(max, base * 2 ** Math.min(weeks, 20));

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

export function utcDayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
