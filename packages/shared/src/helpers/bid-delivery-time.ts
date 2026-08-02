/**
 * Teklif teslim SÜRESİ (2026-08-02) — teklifte kalem teslim tarihi yerine
 * süre seçilir: ilk seçenek stoktan, devamı hafta/ay merdiveni. DB enum'u
 * (BidDeliveryTime) ile birebir; @rothern/db bağımlılığı almamak için
 * string literal tekrarlanır (payment-plan.ts deseni).
 */
export const BID_DELIVERY_TIMES = [
  "STOKTAN", // stokta — hemen teslim
  "W1_2", // 1-2 hafta
  "W3_4", // 3-4 hafta
  "W5_8", // 5-8 hafta
  "M2_3", // 2-3 ay
  "M3_PLUS", // 3 aydan uzun
] as const;
export type BidDeliveryTime = (typeof BID_DELIVERY_TIMES)[number];

export const BID_DELIVERY_TIME_LABELS: Record<BidDeliveryTime, string> = {
  STOKTAN: "Stoktan (hemen)",
  W1_2: "1-2 hafta",
  W3_4: "3-4 hafta",
  W5_8: "5-8 hafta",
  M2_3: "2-3 ay",
  M3_PLUS: "3 aydan uzun",
};

export function bidDeliveryTimeLabel(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return BID_DELIVERY_TIME_LABELS[value as BidDeliveryTime] ?? value;
}
