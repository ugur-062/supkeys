-- G4 — teklif teslim tarihi (madde 8) + teklif geçerlilik gün sayısı (madde 10).
-- Nullable: taslak bunlarsız kaydedilebilir; gönderde zorunluluk serviste uygulanır.
ALTER TABLE "bids"
  ADD COLUMN "deliveryDate" TIMESTAMP(3),
  ADD COLUMN "validityDays" INTEGER;
