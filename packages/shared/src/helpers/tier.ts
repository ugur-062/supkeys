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

/**
 * Koltuk (yetki tablosu Faz 5, 2026-09-06 — kullanıcı kararı "her biri bir
 * koltuk"): koltuk = (kişi, grup) çifti. Satınalma grubunda bir İŞLEM izni
 * 1 koltuk, satış grubunda bir işlem izni 1 koltuk; aynı kişide ikisi = 2.
 * Görüntüleme, raporlar, onay ve yönetim tüketmez. Rol etiketleri
 * SATIN_ALMACI/SATISCI bu gruplardan türer (eski sayım "kişi başı 1"di).
 */
export const SEAT_ROLES = ["SATIN_ALMACI", "SATISCI"] as const;
export const SEAT_GROUPS = ["buy", "sell"] as const;
export type SeatGroup = (typeof SEAT_GROUPS)[number];

/**
 * Kademe başına TOPLAM koltuk limiti. STANDART 2 (kullanıcı kararı —
 * kurucu iki koltuğu da alırsa paket dolar). Ücretli sayılar sonraya
 * bırakıldı ("Paketlere sonra bakacağız"); `null` = limitsiz (bugün yok).
 */
export const SEAT_LIMITS: Record<TierName, number | null> = {
  STANDART: 2,
  BRONZ: 2,
  SILVER: 4,
  GOLD: 8,
};
