/**
 * KVKK firma silmesinde sert silmeyi engelleyen izlerin admin etiketleri.
 * API `DELETE /admin/companies/:id` anonimleştirmede `retainedBecause`
 * (iz türü → adet) döner; toast "siparişli" varsayımı yerine gerçek nedenleri
 * söyler (arayüz testi D-143). Bilinmeyen anahtar ham adıyla gösterilir.
 */
const RETENTION_LABELS: Record<string, string> = {
  ordersAsBuyer: "alıcı siparişi",
  ordersAsSeller: "satıcı siparişi",
  bidsPlaced: "teklif",
  listings: "talep",
  messagesSent: "mesaj",
  reviewsGiven: "verdiği değerlendirme",
  reviewsReceived: "aldığı değerlendirme",
  complaintsMade: "yaptığı şikayet",
  complaintsReceived: "aldığı şikayet",
  membershipEvents: "üyelik geçmişi",
  threadsAsBuyer: "mesaj dizisi (alıcı)",
  threadsAsSeller: "mesaj dizisi (satıcı)",
  listingInvitations: "talep daveti",
  publicInquiries: "bilgi talebi",
};

export function retentionReasonsText(
  retained: Record<string, number> | null | undefined,
): string {
  return Object.entries(retained ?? {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${RETENTION_LABELS[k] ?? k} (${n})`)
    .join(", ");
}

export function anonymizedMessage(
  retained: Record<string, number> | null | undefined,
): string {
  const reasons = retentionReasonsText(retained);
  return reasons
    ? `Firma anonimleştirildi — korunan kayıtlar: ${reasons}`
    : "Firma anonimleştirildi — geçmiş kayıtlar korundu";
}
