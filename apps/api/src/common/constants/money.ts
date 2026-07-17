/**
 * Parasal tavan — tüm tutar/çarpım doğrulamalarının paylaştığı üst sınır.
 *
 * Tüm para kolonları `Decimal(18,2)` → mutlak kolon tavanı 9_999_999_999_999_999.99
 * (≈ 1e16, 16 tam-sayı hanesi). Buraya 1e15 (bir katrilyon) seçtik: kolon
 * limitinin bir kat altında (yuvarlama/toplam payı bırakır) ve hiçbir gerçekçi
 * B2B tutarı buna yaklaşmaz.
 *
 * KRİTİK: bireysel @Max'lar taşmayı KAPATMAZ — asıl değişmez, faktörlerin
 * ÇARPIMI (birim fiyat × miktar) ve satır toplamlarının TOPLAMI'dır. Bu yüzden
 * DTO @Max'ları yalnız değerleri sonlu/makul tutar; gerçek koruma serviste
 * hesaplanan alt/genel toplamın MAX_MONEY ile karşılaştırılmasıdır.
 */
export const MAX_MONEY = 1_000_000_000_000_000; // 1e15

/** Miktar tavanı — Decimal(18,3); çarpımın sonlu kalması için DTO sınırı. */
export const MAX_QUANTITY = 1_000_000_000; // 1e9

/**
 * İlan kapanış tarihi üst sınırı — now + 2 yıl. Üst sınır olmadan closesAt=9999
 * girilebiliyordu → auto-close cron (closesAt <= now) HİÇ tetiklenmez, otomatik
 * yaşam döngüsü kırılır. bidsOpenAt zaten closesAt'ten önce zorunlu → transitif
 * olarak bu tavanın altında kalır (ayrı kontrol gerekmez).
 */
export const MAX_LISTING_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;
