-- Tender'a tahmini toplam tutar denormalize alanı
-- (primaryCurrency'de; tüm items targetUnitPrice'a sahipse hesaplanır)

ALTER TABLE "tenders"
  ADD COLUMN "estimatedTotal" DECIMAL(20, 4);

-- Index: tutar aralığı filtre sorguları için tenant + estimatedTotal
CREATE INDEX "tenders_tenantId_estimatedTotal_idx"
  ON "tenders"("tenantId", "estimatedTotal");
