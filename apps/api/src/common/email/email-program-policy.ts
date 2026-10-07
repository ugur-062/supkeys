import { zonedParts, zonedTimeToUtc } from "../time/country-time-zone";

/**
 * GÜNLÜK E-POSTA PROGRAMI — kurallar, saf fonksiyonlar (2026-09-27, Faz 2).
 *
 * Kullanıcı kararı: "haftada 1 az — her gün göndermeliyiz; kayıtlıya kategorisi
 * uyuşuyorsa sık gönderelim". Kurulan denge:
 *  - KATEGORİ EŞLEŞMESİ: alıcı başına günde 3 e-posta ANINDA; fazlası o akşam
 *    (alıcının yerel saati 18:00) TEK özet e-postada. Kullanıcı Ayarlar'dan
 *    "hepsi anında" seçebilir. Doğrudan davet her zaman anında (bu kurala girmez).
 *  - KARŞILAMA SERİSİ (LIFECYCLE): davranışa bağlı — tamamlanan adımın e-postası
 *    gitmez; firma başına günde en fazla bir; alıcının yerel saati 10-11.
 *  - HAFTALIK GÖRÜNÜRLÜK ÖZETİ: pazartesi yerel 10-11; ilgi azaldıkça seyrelir.
 *  - Uzun süredir giriş yapmayan kullanıcıya ipucu/özet GİTMEZ (itibar).
 */
export const CATEGORY_MATCH_INSTANT_PER_DAY = 3;
export const DIGEST_LOCAL_HOUR = 18;
export const LIFECYCLE_LOCAL_HOUR = 10;
/** Özet bu kadar eski kalemi beklemez (yerel saat bilinmese de gider). */
export const DIGEST_MAX_WAIT_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Alıcının yerel gününün başlangıcı (UTC anı). */
export function localDayStart(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

/** Anlık kategori e-postası gidebilir mi (günlük hak dolmadıysa)? */
export function categoryMatchInstantAllowed(p: { sentTodayLocal: number; allInstant: boolean }): boolean {
  return p.allInstant || p.sentTodayLocal < CATEGORY_MATCH_INSTANT_PER_DAY;
}

/**
 * Akşam özeti gönderilme zamanı geldi mi?
 *
 * GÜNDE TEK ÖZET (derin denetim MU-14): `lastDigestAt` bu adres × türe son
 * gönderilen özetin anı. Alıcının yerel gününde zaten AKŞAM özeti (yerel
 * 18:00 ve sonrası) gittiyse o gün ikincisi GİTMEZ; 18:00 özetinden sonra
 * düşen kalemler ertesi günün 18:00'ini bekler (eskiden gece yarısına dek her
 * 15 dk'da ayrı "özet" gidiyordu). "Dünden kalan kalem sabah da gider" kuralı
 * yalnız o günün akşam özeti KAÇTIYSA geçerli; 24 saati aşan kalem her zaman
 * gider.
 *
 * Sabah telafisi ya da 24 saat tavanıyla 18:00'den ÖNCE giden özet o günün
 * akşam özetini ENGELLEMEZ (derin denetim LU-33): eskiden sabah damgası
 * `last >= dayStart` ile akşamı kapatıyor, sonraki kalemler 24 saat tavanına
 * kalıyor ve özet kalıcı olarak sabah/öğlen saatine kayıyordu.
 */
export function digestDue(p: { now: Date; timeZone: string; oldestItemAt: Date; lastDigestAt?: Date | null }): boolean {
  if (p.now.getTime() - p.oldestItemAt.getTime() >= DIGEST_MAX_WAIT_MS) return true;
  const dayStart = localDayStart(p.now, p.timeZone);
  const last = p.lastDigestAt ?? null;
  // `since` gününden bu yana yerel 18:00 ve sonrasında özet gitti mi?
  const eveningDigestSince = (since: Date): boolean =>
    !!last && last >= since && zonedParts(last, p.timeZone).hour >= DIGEST_LOCAL_HOUR;
  if (eveningDigestSince(dayStart)) return false;
  const local = zonedParts(p.now, p.timeZone);
  if (local.hour >= DIGEST_LOCAL_HOUR) return true;
  // Öğeler bugün eklendiyse akşam 18:00'i bekler. Dünden kalan öğe sabah da
  // gider — ama yalnız öğenin günündeki akşam özeti kaçtıysa.
  if (p.oldestItemAt >= dayStart) return false;
  return !eveningDigestSince(localDayStart(p.oldestItemAt, p.timeZone));
}

/** Yerel saat ipucu/özet penceresinde mi (10:00-10:59)? */
export function inLifecycleWindow(now: Date, timeZone: string): boolean {
  return zonedParts(now, timeZone).hour === LIFECYCLE_LOCAL_HOUR;
}

export type LifecycleStep = "profile" | "first_product" | "verify" | "market" | "verify_again";

export interface LifecycleState {
  /** Onboarding bitiş anı (yoksa seri başlamaz). */
  onboardedAt: Date | null;
  hasProfileText: boolean;
  productCount: number;
  verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | string;
  /** Son 14 günde kategorisine düşen talep sayısı (pazar adımı için). */
  recentMatches: number;
  /** Daha önce gönderilmiş adımlar. */
  sent: ReadonlySet<LifecycleStep>;
}

/** Adım → onboarding'den sonra en erken gün. */
export const LIFECYCLE_DAYS: Record<LifecycleStep, number> = {
  profile: 1,
  first_product: 3,
  verify: 7,
  market: 14,
  // 2026-09-28: hâlâ doğrulanmamışa ikinci hatırlatma. Seri 30 günlük
  // pencerede. Paket tanıtan "silver" adımı ücretsiz dönemde KALDIRILDI (sahip
  // kararı 2026-10-07: hiçbir e-posta paket satmaz; doğrulama yeterli) —
  // ücretli paketler dönünce git geçmişinden geri alınır.
  verify_again: 21,
};

const ORDER: readonly LifecycleStep[] = ["profile", "first_product", "verify", "market", "verify_again"];

/**
 * Sıradaki karşılama e-postası — DAVRANIŞA BAĞLI: adım zaten tamamlandıysa
 * (profil yazılmış, ürün eklenmiş, doğrulama başvurusu yapılmış) atlanır.
 * Aynı gün birden çok adım uygunsa en erken planlanan gider (günde bir).
 */
export function nextLifecycleStep(s: LifecycleState, now: Date): LifecycleStep | null {
  if (!s.onboardedAt) return null;
  const days = (now.getTime() - s.onboardedAt.getTime()) / DAY_MS;
  const verified = s.verification === "PENDING" || s.verification === "VERIFIED";
  const done: Record<LifecycleStep, boolean> = {
    profile: s.hasProfileText,
    first_product: s.productCount > 0,
    verify: verified,
    market: s.recentMatches === 0,
    verify_again: verified,
  };
  for (const step of ORDER) {
    if (s.sent.has(step) || done[step]) continue;
    if (days >= LIFECYCLE_DAYS[step]) return step;
  }
  return null;
}

/**
 * İlgiye göre seyrelme (haftalık özet): son giriş 30 günü aştıysa iki haftada
 * bir, 90 günü aştıysa dört haftada bir, 180 günü aştıysa HİÇ.
 * `weekIndex`: yılın haftası gibi ardışık bir sayaç.
 */
export function weeklySummaryAllowed(lastLoginAt: Date | null, now: Date, weekIndex: number): boolean {
  const idle = lastLoginAt ? (now.getTime() - lastLoginAt.getTime()) / DAY_MS : Number.POSITIVE_INFINITY;
  if (idle > 180) return false;
  if (idle > 90) return weekIndex % 4 === 0;
  if (idle > 30) return weekIndex % 2 === 0;
  return true;
}

/** Karşılama serisi: 180 günden uzun süredir giriş yoksa gönderilmez. */
export function lifecycleAllowed(lastLoginAt: Date | null, createdAt: Date, now: Date): boolean {
  const ref = lastLoginAt ?? createdAt;
  return (now.getTime() - ref.getTime()) / DAY_MS <= 180;
}

/** Pazartesi mi (yerel)? */
export function isLocalMonday(now: Date, timeZone: string): boolean {
  return zonedParts(now, timeZone).weekday === 1;
}

/** Ardışık hafta sayacı (UTC, epoch'tan). */
export function weekIndexOf(now: Date): number {
  return Math.floor(now.getTime() / (7 * DAY_MS));
}
