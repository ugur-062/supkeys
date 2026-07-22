/**
 * Paket kademeleri — TEK KAYNAK (api + web + admin aynı sırayı okur).
 * STANDART = paket almamış pasif üyelik (kaydolur, KYC yapar; PUBLIC ihaleleri
 * MASKELİ görür, teklif veremez; davet/bağlantı ihalelerine teklif verir;
 * dizinde görünmez). BRONZ+ = paketli. Eşikler: dizin/davet/PUBLIC-teklif →
 * BRONZ; satınalma/ihale-açma/rapor/şablon/onay-akışı-kurma/AI → SILVER;
 * "Gold Üye" rozeti → GOLD.
 */
export const TIER_ORDER = {
  STANDART: 0,
  BRONZ: 1,
  SILVER: 2,
  GOLD: 3,
} as const;

export type TierName = keyof typeof TIER_ORDER;

/** Paralı kademeler — süreli üyelik (membershipEndAt) taşıyanlar. */
export const PAID_TIERS = ["BRONZ", "SILVER", "GOLD"] as const;

/** `t` en az `min` kademesinde mi? Bilinmeyen değer STANDART sayılır (fail-closed). */
export function tierAtLeast(t: string, min: TierName): boolean {
  const rank = TIER_ORDER[t as TierName] ?? 0;
  return rank >= TIER_ORDER[min];
}
