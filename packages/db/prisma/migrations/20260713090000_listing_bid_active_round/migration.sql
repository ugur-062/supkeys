-- Pazarlıkta "turda tek aktif gönderim" hakkı: aktif gönderimin yapıldığı tur.
-- Carry-over round'u ilerletir ama bu kolona dokunmaz (taşınan hak yakmaz).
ALTER TABLE "listing_bids" ADD COLUMN "activeBidRound" INTEGER;
