/**
 * İngiliz usulü — döviz-farkında adım/tutar çevrimi.
 *
 * Kur haritası birim başına TRY'dir (TCMB; TRY=1 varsayılır). Canlı ihalede
 * ilanın AÇILIŞ GÜNÜ damgası (english.rateSnapshot) verilir — ihale boyunca
 * sabittir; sihirbaz/yeni-tur önizlemesinde güncel kurlar verilir.
 */

export function auctionRateOf(
  currency: string,
  rates: Record<string, number> | null | undefined,
): number | null {
  if (currency === "TRY") return 1;
  const r = rates?.[currency];
  return typeof r === "number" && r > 0 ? r : null;
}

/** Tutarı bir birimden diğerine çevirir; kur yoksa null. */
export function convertAuctionAmount(
  value: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> | null | undefined,
): number | null {
  if (!Number.isFinite(value)) return null;
  if (fromCurrency === toCurrency) return value;
  const rf = auctionRateOf(fromCurrency, rates);
  const rt = auctionRateOf(toCurrency, rates);
  if (rf == null || rt == null) return null;
  return (value * rf) / rt;
}

/**
 * Sabit azaltma/artırma payını hedef birime çevirir — 2 haneye YUKARI
 * yuvarlanır ki "en az adım eşdeğeri" garantisi yuvarlamayla erimesin
 * (backend'le birebir aynı kural).
 */
export function convertAuctionStep(
  value: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> | null | undefined,
): number | null {
  const v = convertAuctionAmount(value, fromCurrency, toCurrency, rates);
  if (v == null) return null;
  return Math.ceil(v * 100) / 100;
}

export function currencySymbol(currency: string | null | undefined): string {
  return !currency || currency === "TRY" ? "₺" : currency;
}

/** "10,64 $ · 9,32 €" — adımın diğer izinli birimlerdeki karşılıkları. */
export function formatStepConversions(
  value: number,
  fromCurrency: string,
  toCurrencies: string[],
  rates: Record<string, number> | null | undefined,
): string {
  const parts: string[] = [];
  for (const cur of toCurrencies) {
    if (cur === fromCurrency) continue;
    const v = convertAuctionStep(value, fromCurrency, cur, rates);
    if (v == null) continue;
    parts.push(
      `${v.toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${currencySymbol(cur)}`,
    );
  }
  return parts.join(" · ");
}
