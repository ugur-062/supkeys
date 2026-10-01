-- Teklifsiz talep hatirlatmasi (listing_zero_bid) portal backfill'i (arayuz
-- testi D-115, gozden gecirme). SALT DML, sema degismez.
--
-- Hatirlatma talebi ACANA (alici) gider; servis artik satiri
-- portal = 'satinalma' ile yaziyor. Bu kuraldan once yazilan satirlar
-- portal NULL (ortak) kaldigi icin Satis suzgecinde de gorunuyor ve
-- Satinalma rozetine yansimiyordu.
-- Idempotent: yalniz portal IS NULL satirlara dokunur.
UPDATE "notifications"
SET "portal" = 'satinalma'
WHERE "type" = 'listing_zero_bid'
  AND "portal" IS NULL;
