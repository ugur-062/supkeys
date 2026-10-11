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

/**
 * Firma profili hizmet çipi uzunluk tavanı — PATCH /company/profile DTO'su,
 * AI tanıtım önerisi ucunun gövdesi (taslak hizmetler) ve web ChipEditor aynı
 * sabiti okur (derin denetim S069: iki taraf ayrı tavan kullanınca Kaydet 400
 * düşüyordu).
 */
export const COMPANY_SERVICE_MAX_LENGTH = 60;

/** Profil hizmet çipi adedi (DTO `@ArrayMaxSize` ve web ChipEditor sayacı). */
export const COMPANY_SERVICES_MAX = 20;

/**
 * Profilim'in serbest metin alanlarının uzunluk tavanları — PATCH
 * /company/profile DTO'su ve web profil düzenleyicisi (`maxLength`, sayaç,
 * alan adlı hata) aynı sabiti okur (arayüz testi D-054: istemcide sınır yoktu,
 * sunucu hatası hangi alan olduğunu söylemiyordu).
 */
export const COMPANY_PROFILE_LIMITS = {
  industry: 100,
  aboutText: 2000,
  website: 200,
  linkedinUrl: 150,
  instagramUrl: 150,
  foundedYearMin: 1800,
  foundedYearMax: 2100,
} as const;

/**
 * Talep gövdesindeki davet listesi tavanı — API `CreateListingDto.invitations`
 * ve web talep formu aynı sabiti okur. "Bağlantılarım" kipinde liste alıcının
 * TÜM bağlantılarıdır; tavan bu listeyi tek gövdede taşıyacak kadar geniş
 * tutulur (derin denetim S083/S095: 200'lük tavan taşan bağlantıları kayıt
 * sonrası ayrı davet çağrısına itiyordu — canlı düzenlemede sunucu davetleri
 * yeniden yazdığı için taşan firmalar her kayıtta yeniden davet e-postası
 * alıyordu). 5000 × kısa kod ≈ 60 KB — 5 MB gövde sınırının çok altında.
 */
export const MAX_LISTING_INVITATIONS = 5000;

/**
 * Ürün görseli tavanı — API vitrin DTO'su (`images` `@ArrayMaxSize`), web
 * görsel yükleyici ve herkese açık galeri AYNI sayıyı okur (arayüz testi
 * O-100: yükleyici ve API 8'e izin verirken galeri ilk 6'yı kesiyordu, 7. ve
 * 8. görsel hiçbir yerde görünmüyordu).
 */
export const MAX_PRODUCT_IMAGES = 8;

/**
 * Şablon (soru seti / tedarikçi grubu) ad uzunluğu ve soru seti soru adedi —
 * API DTO'ları ve web şablon pencereleri (`maxLength`, pasif "Soru Ekle") aynı
 * sabiti okur (arayüz testi D-261).
 */
export const TEMPLATE_NAME_MAX_LENGTH = 120;
export const QUESTION_TEMPLATE_MAX_ITEMS = 20;
