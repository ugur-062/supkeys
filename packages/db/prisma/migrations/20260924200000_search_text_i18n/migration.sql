-- Çok dilli arama metni (i18n arama, 2026-09-24).
--
-- NE: ürün, talep ve firmaya `searchTextI18n` — kaynak metin + DONE içerik
-- çevirilerinin (en/ru) TR-katlanmış birleşimi. Yazan tek yer içerik çevirisi
-- servisi; API açılışında mevcut çevirilerden doldurulur (model çağrısı yok).
--
-- GÜVENLİ: yalnız EKLEME. `ADD COLUMN … NOT NULL DEFAULT ''` PG11+ tabloyu
-- yeniden yazmaz. İndeksler CONCURRENTLY DEĞİL (Prisma migration'ı
-- transaction'a sarar); tablolar küçük (canlıda yüzlerce satır), kurulum anlık.
-- `company_items.searchText` için de trigram indeksi eklendi: ürün araması
-- `LIKE '%…%'` ile tam tarama yapıyordu.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "company_items" ADD COLUMN IF NOT EXISTS "searchTextI18n" TEXT NOT NULL DEFAULT '';
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "searchTextI18n" TEXT NOT NULL DEFAULT '';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "searchTextI18n" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "company_items_searchText_trgm_idx"
  ON "company_items" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "company_items_searchTextI18n_trgm_idx"
  ON "company_items" USING GIN ("searchTextI18n" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "listings_searchTextI18n_trgm_idx"
  ON "listings" USING GIN ("searchTextI18n" gin_trgm_ops);
