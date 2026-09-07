-- "Hızlı yanıt veren" süzgeci (2026-09-07).
--
-- İKİ NULLABLE ADD COLUMN, DEFAULT YOK → tablo yeniden yazılmaz, kilit anlık,
-- veri kaybı yok, geri dönüşü DROP COLUMN. Backfill gerekmez: gece cron'u
-- (company-views.scheduler) ilk koşumunda doldurur; o ana dek değer NULL ve
-- süzgeç bu firmaları DIŞARIDA bırakır ("yavaş" saymaz).
ALTER TABLE "companies" ADD COLUMN "medianReplyHours" DOUBLE PRECISION;
ALTER TABLE "companies" ADD COLUMN "medianReplyComputedAt" TIMESTAMP(3);
