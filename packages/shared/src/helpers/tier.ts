/**
 * Paket kademeleri — TEK KAYNAK (api + web + admin aynı sırayı okur).
 *
 * ÜÇ PAKET (2026-09-06, kullanıcı kararı; Bronz KALDIRILDI, mevcut Bronz
 * firmalar Silver'a taşındı):
 * - STANDART (ücretsiz, 2026-09-06 revizyonu "premium çekmek için"): ürün
 *   vitrini (PRODUCT_LIMITS tavanı; belge/video yok) + herkese açık profil +
 *   dizinde yer (paketlilerden SONRA sıralanır) + firmaları keşfetme;
 *   davetli/bağlantılı taleplere teklif, mesaj, sipariş takibi. PUBLIC
 *   talepleri GÖRMEZ (yalnız kilitli sayı), bağlantı daveti GÖNDEREMEZ (gelen
 *   daveti kabul eder), gelen bilgi taleplerini ANONİM görür (soru evet,
 *   kimlik/iletişim/yanıt hayır), profilinde "Doğrulanmamış" yazar. 2 koltuk.
 * - SILVER (tedarikçi paketi = SATIŞ paneli): öncelikli dizin sırası + sınırsız
 *   ürün + belge/video + PUBLIC talepleri görme ve teklif + bağlantı daveti +
 *   bilgi taleplerinde alıcı kimliği ve yanıt + Ziyaret Edenler + İş Analizi +
 *   satış AI'ı. Satınalma paneli YOK. 4 koltuk.
 * - GOLD (iki panel): Silver + satınalma paneli (talep açma, kazandırma, onay
 *   akışı, raporlar, şablonlar, satınalma AI'ı) + "Gold Üye" rozeti. 6 koltuk.
 */
export const TIER_ORDER = {
  STANDART: 0,
  SILVER: 1,
  GOLD: 2,
} as const;

export type TierName = keyof typeof TIER_ORDER;

/** Paralı kademeler — süreli üyelik (membershipEndAt) taşıyanlar. */
export const PAID_TIERS = ["SILVER", "GOLD"] as const;

/** Herhangi bir paket (dizin, profil, PUBLIC teklif, bağlantı daveti…). */
export const PAID_TIER: TierName = "SILVER";
/** Satınalma paneli kademesi (talep açma, kazandırma, rapor, şablon, onay akışı). */
export const BUYING_TIER: TierName = "GOLD";

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
 * Kademe başına TOPLAM koltuk limiti (kullanıcı kararı 2026-09-06: 2/4/6).
 * Silver'da satınalma paneli olmadığından 4 koltuğun hepsi satış koltuğu;
 * Gold'da 6 koltuk iki grubun toplamı (kurucu iki paneli kullanırsa 2 gider).
 * `null` = limitsiz (bugün yok).
 */
export const SEAT_LIMITS: Record<TierName, number | null> = {
  STANDART: 2,
  SILVER: 4,
  GOLD: 6,
};

/**
 * Kademe başına YAYINDA (vitrinde) ürün tavanı — `null` = limitsiz.
 * Standart 10 (kullanıcı kararı 2026-09-06): tavan olmazsa küçük tedarikçi
 * için ücretsiz paket yeterli olur ve Silver'ın vitrin faydası kalmaz.
 * Taslak sayılmaz; tavan yalnız `publish` anında kapıdır.
 */
export const PRODUCT_LIMITS: Record<TierName, number | null> = {
  STANDART: 10,
  SILVER: null,
  GOLD: null,
};

/** Ürün belgesi (PDF) ve video bağlantısı: paketli özellik (Silver+). */
export const PRODUCT_MEDIA_TIER: TierName = "SILVER";
