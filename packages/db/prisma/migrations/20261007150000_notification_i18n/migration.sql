-- Bildirim metninin uretim girdileri (katalog anahtarlari + tipli parametreler
-- + ic CTA yolu). Okuma yolu satiri okuyanin guncel diliyle yeniden uretir.
-- Eklemeli: nullable JSONB, DEFAULT yok -> metadata-only (tablo yeniden
-- yazilmaz, uzun kilit yok). Backfill YOK: eski satirlarda yalniz uretilmis
-- metin saklandi, girdiler geri cikarilamaz (NULL = eski satir, saklanan metin
-- aynen doner).
ALTER TABLE "notifications" ADD COLUMN "i18n" JSONB;
