import type { BidDeliveryTime } from "@rothern/db";

/**
 * Teslim SÜRESİ merdiveni → gün cinsinden ÜST sınır (denetim 2026-08-28
 * Parça 12 #10).
 *
 * Arka plan: 2026-08-02'de teklif tarafı `deliveryDate` (tarih) yerine
 * `deliveryTime` (süre bandı) sormaya başladı ve sipariş kabulü tahmini teslim
 * tarihini sormayı bıraktı. `CompanyOrder.expectedDeliveryDate` ise hâlâ
 * `_max(CompanyOrderItem.deliveryDate)`'ten türetiliyordu — yeni tekliflerin
 * hiçbiri o alanı doldurmadığı için değer YAPISAL OLARAK null kaldı. Sonuç:
 * Aksiyon Merkezi'nin "critical" seviyeli GECİKEN TESLİMAT satırı ve pano KPI'ı
 * bir aydır sürekli 0 gösteriyordu — alarm sessizce ölmüştü.
 *
 * Bandın ÜST sınırını alıyoruz: gecikme alarmı ancak tedarikçinin taahhüt
 * ettiği en geç tarih de geçtiğinde çalmalı (erken/yanlış alarm, alarmın
 * tümüyle susmasından daha zararlıdır — kullanıcı görmezden gelmeye başlar).
 *
 * `M3_PLUS` bilinçli olarak `null`: "3 aydan uzun"un üst sınırı YOKTUR, uydurma
 * bir tarih üretmek yerine o siparişi alarm kapsamı dışında bırakıyoruz.
 */
export const DELIVERY_TIME_MAX_DAYS: Record<BidDeliveryTime, number | null> = {
  STOKTAN: 7,
  W1_2: 14,
  W3_4: 28,
  W5_8: 56,
  M2_3: 90,
  M3_PLUS: null,
};

/**
 * Sipariş kalemlerinin teslim sürelerinden EN GEÇ tahmini teslim tarihi.
 * Bandı olmayan (`M3_PLUS`) ya da hiç süre taşımayan kalem varsa `null` —
 * fail-closed: kısmi bilgiden "erken" bir tarih üretip yanlış gecikme alarmı
 * çalmaktansa alarmı hiç kurmuyoruz.
 */
export function expectedDeliveryFromTimes(
  from: Date,
  times: (BidDeliveryTime | null)[],
): Date | null {
  if (times.length === 0) return null;
  let maxDays = 0;
  for (const t of times) {
    if (t == null) return null;
    const d = DELIVERY_TIME_MAX_DAYS[t];
    if (d == null) return null;
    if (d > maxDays) maxDays = d;
  }
  return new Date(from.getTime() + maxDays * 24 * 60 * 60 * 1000);
}
