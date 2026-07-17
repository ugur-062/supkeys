/**
 * Sipariş ödeme-durumu türetmeleri — INV-MONEY-1 frontend kapanışı (F1).
 *
 * Backend'in Decimal ile hesapladığı değerleri KULLANIR, kendi float hesabını
 * yapmaz; **epsilon YOK**. Backend para karşılaştırmalarındaki 0.01 toleransı
 * Grup 2'de BİLİNÇLE kaldırıldı (8095851, INV-MONEY-1: tam-eşit geçer, 1 kuruş
 * eksik/fazla yakalanır). Frontend'de kalan `confirmed + 0.01 >= amount` sezgisi
 * 1 kuruş eksikte "Tamamla"yı açıyordu; backend exact-Decimal reddediyordu.
 */

/**
 * Tam ödeme onaylı mı — backend `paymentTotals.remaining` = `Decimal.max(0,
 * total − confirmed)` (company-orders.service). `remaining ≤ 0` TAM OLARAK
 * backend `isFullyPaid(total, confirmed)` (confirmed ≥ total) ile eşdeğerdir.
 * paymentTotals yoksa güvenli varsayılan: kalan = tutar (>0) → ödenmemiş.
 */
export function orderFullyPaid(
  paymentTotals: { remaining?: string | null } | null | undefined,
  amount: string | number,
): boolean {
  const remaining = paymentTotals?.remaining ?? amount;
  return Number(remaining) <= 0;
}

/**
 * Gönderim-öncesi peşin eşiği karşılandı mı (S3 ship guard). `advanceDue` ve
 * `confirmedPaid` ikisi de backend 2-ondalık string/number → exact `>=` (epsilon
 * gereksiz). advanceDue ≤ 0 = peşin şartı yok.
 */
export function isAdvanceMet(
  advanceDue: string | number | null | undefined,
  confirmedPaid: string | number,
): boolean {
  const due = Number(advanceDue ?? 0);
  return due <= 0 || Number(confirmedPaid) >= due;
}
