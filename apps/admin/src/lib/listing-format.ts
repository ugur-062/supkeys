/**
 * Admin ilan detayı "Kapalı zarf" rozeti formata bağlıdır (arayüz testi T-16 /
 * webB-02): RFQ her zaman kapalı zarf, açık eksiltme (ENGLISH_AUCTION) hiçbir
 * zaman. Kayıtlı `isSealedBid` bayrağı güvenilmez (eski RFQ turlarında false,
 * eksiltmede oluşturma varsayılanı / yeni tur true yazar) — yalnız format yoksa
 * ona bakılır. Web tarafındaki `sealedRuleActive` ile aynı kural.
 */
export function isSealedListing(l: {
  format: string | null;
  isSealedBid?: boolean | null;
}): boolean {
  return l.format ? l.format === "RFQ" : !!l.isSealedBid;
}
