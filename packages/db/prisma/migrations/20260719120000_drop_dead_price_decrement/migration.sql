-- Ölü kolon temizliği (Grup 4): priceDecrement* hiçbir kuralda enforce EDİLMİYOR,
-- frontend'de gösterilmiyor — BAFO (minimum-pay kaldırıldı) öncesi minimum-decrement
-- kalıntısı. Üretim kodu asla değer yazmıyordu (yalnız null-set) → kolonlar hep null.
-- Salt DROP (dedup gerekmez). Kolonlar enum tipe bağımlı → önce COLUMN sonra TYPE.
ALTER TABLE "listings" DROP COLUMN "priceDecrementType";
ALTER TABLE "listings" DROP COLUMN "priceDecrementValue";
ALTER TABLE "listings" DROP COLUMN "priceDecrementBasis";

DROP TYPE "ListingDecrementType";
DROP TYPE "ListingDecrementBasis";
