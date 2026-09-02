-- Pazar yeri (Faz 0) — public görünürlük ve arama motoru indeksi bayrakları.
--
-- Güvenlik notu (docs/migration-safety.md): iki ADD COLUMN, ikisi de SABİT
-- DEFAULT + NOT NULL. PostgreSQL 11+ sabit default'ta tabloyu YENİDEN YAZMAZ
-- (katalog güncellemesi), dolayısıyla kilit anlık. DROP/rename/enum değişimi
-- yok, backfill gerekmiyor, veri kaybı yok.
--
-- Anlam ayrımı — ikisi FARKLI soruyu yanıtlar:
--   companies.publicListingsEnabled → firmanın PUBLIC ilanları giriş yapmamış
--     ziyaretçiye GÖSTERİLSİN Mİ (pazar yeri vitrini).
--   listings.publicIndexable        → bu ilan ARAMA MOTORLARINA açık mı.
-- İndeks kapısı üç koşulun kesişimidir: visibility=PUBLIC ∧
-- companies.publicEnabled ∧ listings.publicIndexable.
--
-- Varsayılanlar açık: `visibility=PUBLIC` seçmiş firma zaten "herkes görsün"
-- demiştir; bayraklar bu kararı GERİ ALMAK isteyene tek nokta verir. Mevcut
-- rıza kapısı `companies.publicEnabled` (default false) olduğu gibi durur —
-- yani bu migration hiçbir ilanı kendiliğinden Google'a açmaz.

ALTER TABLE "companies"
  ADD COLUMN "publicListingsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "listings"
  ADD COLUMN "publicIndexable" BOOLEAN NOT NULL DEFAULT true;
