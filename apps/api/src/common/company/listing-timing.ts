/**
 * İlan zaman-sınırı yardımcıları — TEK KAYNAK (S6/S7 drift önleme). Saf
 * fonksiyonlar (Prisma/servis state yok); teklif/satın-al kapıları buradan okur.
 */

/**
 * S6 — "kapanış anı DAHİL kapalı" sınırı. İlan `closesAt` anında (ve sonrası)
 * kapalıdır; teklif/satın-al reddedilir. placeBid + buyNow bu tek tanımı
 * kullanır (eskiden iki birebir `Date.now() >= closesAt.getTime()` guard'ı).
 *
 * DİKKAT — Prisma AYNASI: cron (`listing.scheduler.ts doCloseExpired`) aynı
 * sınırı DB tarafında `closesAt: { lte: new Date() }` ile ifade eder; JS helper
 * import EDEMEZ → o site yorumla senkron tutulur (sınır tek yönlü: ne
 * "kapandıktan sonra açık" penceresi ne teklif-kabul boşluğu).
 */
export function isListingClosedAt(
  closesAt: Date | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return closesAt != null && nowMs >= closesAt.getTime();
}

const MS_PER_DAY = 86_400_000;

/**
 * S7 — teklif "son geçerlilik anı" (ms). Tek formül: `submittedAt +
 * validityDays gün`. createNextRound (turda açılışta süresi dolan teklifleri
 * ayıklama) + extendBidValidity (uzatma yeterli mi) aynı tanımı kullanır.
 * `submittedAt`/`validityDays` yoksa (legacy teklif) → `null` = SÜRESİZ
 * (asla dolmaz); çağıran null'ı "dolmadı" olarak yorumlar.
 */
export function bidValidUntilMs(
  submittedAt: Date | null | undefined,
  validityDays: number | null | undefined,
): number | null {
  if (submittedAt == null || validityDays == null) return null;
  return submittedAt.getTime() + validityDays * MS_PER_DAY;
}
