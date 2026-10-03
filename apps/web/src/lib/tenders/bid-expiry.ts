/**
 * Canlı teklifin geçerliliği doldu mu (CLAUDE.md §6: geçerliliği dolmuş teklif
 * KAZANDIRILAMAZ; sunucu `bidValidUntilMs` ile 400 döner, ekranda Kazandır
 * pasif + ipucu). Son gün = submittedAt + validityDays; pazarlıkta
 * validityDays null → süresiz. Talep detayı ve teklif detayı AYNI hesabı
 * kullanır (derin denetim S060: teklif detayında bu kapı yoktu).
 */
export function isBidExpired(
  bid: {
    status: string;
    submittedAt?: string | null;
    validityDays?: number | null;
  },
  now: number = Date.now(),
): boolean {
  return (
    bid.status === "SUBMITTED" &&
    !!bid.submittedAt &&
    !!bid.validityDays &&
    new Date(bid.submittedAt).getTime() + bid.validityDays * 86_400_000 < now
  );
}
