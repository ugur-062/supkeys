/**
 * Kalem satır tutarı — kuruşa ROUND_HALF_UP (miktar Decimal(18,3), birim fiyat
 * Decimal(18,2)). Float `qty × price` yuvarlanmadan basılınca "4,995 ₺" satırı
 * "5,00" toplamının yanında görünüyordu (derin denetim LU-22). Tam sayı
 * aritmetiği: fiyat kuruşa, miktar binde bire çevrilir; float çarpım hatası
 * (1,5 × 3,33 = 4,99499…) yuvarlamayı aşağı kaydırmaz.
 */
export function lineAmount(quantity: number, unitPrice: number): number {
  const q = Math.round(quantity * 1000);
  const c = Math.round(unitPrice * 100);
  const milli = q * c; // kuruş × 1000
  const cents =
    milli >= 0 ? Math.floor((milli + 500) / 1000) : -Math.floor((-milli + 500) / 1000);
  return cents / 100;
}

/** Para gösterimi için sabit 2 ondalık (`formatMoney` ile aynı kural). */
export const MONEY_FRACTION = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
