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
 * Borç kapandı mı (ONAYLI ödemeye göre) — tek meşru sinyal backend'in
 * `paymentSettled` alanıdır (`isFullyPaid(total, confirmed)`, liste ucuyla
 * birebir aynı helper).
 *
 * DİKKAT: `paymentTotals.remaining` = `max(0, total − confirmed − pending)` —
 * yani "kalan BİLDİRİLEBİLİR tutar" (S4/Madde 16; `recordPayment` tavanıyla
 * aynı taban). Onay BEKLEYEN bildirim de düşüldüğü için "ödendi" göstergesi
 * DEĞİLDİR; eski sürüm bunu ödendi sanıyor ve detay "Ödeme tamamlandı" derken
 * liste "Ödeme bekliyor" diyordu (denetim 2026-08-23 Parça 3 #6).
 * Sıra: `settled` → onaylı toplam → (son çare) remaining. Epsilon YOK.
 */
export function orderFullyPaid(
  paymentTotals:
    | { confirmed?: string | null; remaining?: string | null }
    | null
    | undefined,
  amount: string | number,
  settled?: boolean | null,
): boolean {
  if (typeof settled === "boolean") return settled;
  if (Number(amount) <= 0) return true; // 0 tutarlı sipariş edge
  if (paymentTotals?.confirmed != null) {
    return Number(paymentTotals.confirmed) >= Number(amount);
  }
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
