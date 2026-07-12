-- Açık eksiltme/artırma kur damgası: tur açılış günü TCMB kurları (birim başına TRY).
ALTER TABLE "listings" ADD COLUMN "auctionRateSnapshot" JSONB;
