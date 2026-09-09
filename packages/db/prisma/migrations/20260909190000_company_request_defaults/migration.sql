-- Talep şartları (2026-09-09, hızlı talep): firmanın ticari profili tek JSON
-- kolon. NULLABLE, DEFAULT YOK → tablo yeniden yazılmaz, kilit anlık, geri
-- dönüşü DROP COLUMN. Backfill yok: boşken son yayımlanan talepten türetilir.
ALTER TABLE "companies" ADD COLUMN "requestDefaults" JSONB;
