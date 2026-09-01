-- Faz 1 — kodlu ölçü birimi (expand adımı).
--
-- GÜVENLİK NOTU (docs/migration-safety.md): TAMAMEN EKLEMELİ, iki nullable
-- ADD COLUMN (varsayılansız) → PG'de katalog değişikliği, TABLO YENİDEN
-- YAZILMAZ. Veri kaybı yok; geri alma = iki DROP COLUMN.
--
-- Eski serbest metin `unit` kolonu KALIR ve yazılmaya devam eder. Okuma yolu
-- `unitCode ?? unit` sırasını uygular, yani bu migration TEK BAŞINA hiçbir
-- davranış değiştirmez. `unit`'in düşürülmesi (contract adımı) AYRI bir
-- karardır ve bu sürümün kapsamı dışındadır.
--
-- `company_order_items.unitCode` snapshot alanıdır: geçmiş siparişlerin
-- birimi geriye dönük DOLDURULMAZ, yalnız yeni award'lar yazar.

ALTER TABLE "listing_items" ADD COLUMN "unitCode" TEXT;

ALTER TABLE "company_order_items" ADD COLUMN "unitCode" TEXT;
