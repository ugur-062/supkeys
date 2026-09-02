-- Kategori görseli (Faz 3a) — NULL yapılabilir tek kolon.
--
-- Güvenlik (docs/migration-safety.md): tek ADD COLUMN, DEFAULT YOK, NOT NULL
-- YOK → PostgreSQL yalnız katalogu günceller, tabloyu taramaz. 158.018 satırlık
-- tabloda bile kilit anlık. Geri alma: DROP COLUMN.
--
-- Kolon çoğu segmentte BOŞ kalacak ve bu BEKLENEN: boşken web tarafı segment
-- koduna göre üretilmiş görsel basıyor. Kolon, gerçek fotoğrafla yükseltme
-- yoludur — zorunlu bir alan değil.
ALTER TABLE "categories" ADD COLUMN "imageUrl" TEXT;
