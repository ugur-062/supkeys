/**
 * Parasal / miktar / süre tavanları — TEK KAYNAK (backend DTO + servis guard'ları
 * VE frontend form validation aynı sabitleri okur; iki yerde literal tekrarı
 * drift yaratır). Yalnız SABİT SAYILAR — bu pakete hesap kütüphanesi (decimal.js
 * vb.) EKLENMEZ (kural shared'da, para hesabı API katmanında).
 *
 * Backend `apps/api/src/common/constants/money.ts` bunları re-export eder.
 */

/**
 * Parasal tavan. Para kolonları `Decimal(18,2)` → mutlak kolon tavanı ≈ 1e16.
 * 1e15 seçildi: kolon limitinin bir kat altında (yuvarlama/toplam payı). Bireysel
 * @Max taşmayı KAPATMAZ (asıl değişmez birim×miktar çarpımı + satır toplamları
 * TOPLAMI'dır → gerçek koruma serviste). DTO/form @Max yalnız değerleri makul tutar.
 */
export const MAX_MONEY = 1_000_000_000_000_000; // 1e15

/** Miktar tavanı — `Decimal(18,3)`; çarpımın sonlu kalması için DTO/form sınırı. */
export const MAX_QUANTITY = 1_000_000_000; // 1e9

/** Para alanı ondalık basamak sınırı — `Decimal(18,2)`. */
export const MONEY_DECIMALS = 2;

/** Miktar ondalık basamak sınırı — `Decimal(18,3)`. */
export const QUANTITY_DECIMALS = 3;

/** Asgari para tutarı (teklif/ödeme) — 1 kuruş. */
export const MIN_MONEY = 0.01;

/** Asgari miktar. */
export const MIN_QUANTITY = 0.001;

/**
 * İlan kapanış tarihi üst sınırı — now + 2 yıl. Üst sınır olmadan closesAt=9999
 * girilebiliyordu → auto-close cron (closesAt <= now) HİÇ tetiklenmez, otomatik
 * yaşam döngüsü kırılır. bidsOpenAt zaten closesAt'ten önce zorunlu → transitif.
 */
export const MAX_LISTING_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;
