-- Admin talep mudahalesi (admin_listing_closed / _extended / _reopened) ve
-- AI tedarikci onerisi (ai_supplier_suggestions) bildirimlerinin portal
-- backfill'i (arayuz testi son tur; D-115 listing_zero_bid backfill'iyle ayni
-- kalip). SALT DML, sema degismez.
--
-- Bu bildirimler talebin SAHIBINE (alici) gider; servisler satiri artik
-- portal = 'satinalma' ile yaziyor (api1-02 yeniden dogrulama). Bu kuraldan
-- once yazilan satirlar portal NULL (ortak) kaldigi icin Satis suzgecinde
-- rozetsiz gorunmeye devam ediyordu. Talep tipi yalniz ALIM oldugundan sahip
-- portali her zaman 'satinalma'.
-- Idempotent: yalniz portal IS NULL satirlara dokunur.
UPDATE "notifications"
SET "portal" = 'satinalma'
WHERE "type" IN (
    'admin_listing_closed',
    'admin_listing_extended',
    'admin_listing_reopened',
    'ai_supplier_suggestions'
  )
  AND "portal" IS NULL;
