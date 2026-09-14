-- ARANAN TEDARİKÇİ TİPİ — alım talebine ikinci eksen.
--
-- Tümüyle EKLEMELİ ve güvenli: yeni dizi kolonu + boş dizi varsayılanı.
-- NOT NULL backfill yok, tip değişimi yok, tablo yeniden yazımı yok, index yok
-- (alan WHERE'de kullanılmıyor; eşleşme adayları bellekte sıralanıyor).
-- Eski API sürümü kolonu okumaz, yeni API eski satırlarda '{}' görür.
ALTER TABLE "listings"
  ADD COLUMN "preferredActivities" "CompanyActivity"[] NOT NULL DEFAULT ARRAY[]::"CompanyActivity"[];
