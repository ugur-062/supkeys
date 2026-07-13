-- "Kapandı" (CLOSED) ara durumu kaldırıldı: kapanan ihale doğrudan
-- değerlendirmededir (IN_AWARD). Mevcut CLOSED kayıtları taşınır; enum değeri
-- legacy olarak şemada kalır (PG enum değeri silmek riskli, artık yazılmıyor).
UPDATE "listings" SET "status" = 'IN_AWARD' WHERE "status" = 'CLOSED';
