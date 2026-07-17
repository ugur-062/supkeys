/**
 * Parasal/miktar/süre tavanları — TEK KAYNAK `@rothern/shared` (backend DTO +
 * servis guard'ları VE frontend form validation aynı sabitleri okur; iki yerde
 * literal tekrarı drift yaratır — F2/F3/F4). Buradan re-export edilir ki mevcut
 * backend importer'ları (`../../common/constants/money`) değişmesin.
 *
 * KRİTİK: bireysel @Max'lar taşmayı KAPATMAZ — asıl değişmez, faktörlerin
 * ÇARPIMI (birim fiyat × miktar) ve satır toplamlarının TOPLAMI'dır; gerçek
 * koruma serviste hesaplanan alt/genel toplamın MAX_MONEY ile karşılaştırılması.
 */
export {
  MAX_MONEY,
  MAX_QUANTITY,
  MAX_LISTING_HORIZON_MS,
  MONEY_DECIMALS,
  QUANTITY_DECIMALS,
  MIN_MONEY,
  MIN_QUANTITY,
} from "@rothern/shared";
