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
