-- Kategori aramasına trigram indeksi.
--
-- NEDEN ŞİMDİ: katalog Ariba dışa aktarımına geçince aranan satır sayısı
-- 21.577'den (L3+L4, eski UNSPSC çıkarımı) 157.402'ye çıkıyor — ~7 kat.
-- `searchHierarchical` `contains` kullanıyor (`LIKE '%…%'`), bu da btree ile
-- indekslenemez: her arama TAM TARAMA. Üstelik sorgu tokenlere bölünüp
-- AND'lendiği için tarama kelime başına tekrarlanıyor ve sonuçlar `take: 200`
-- öncesi ORDER BY ile sıralandığından eşleşen her satır okunmak zorunda.
--
-- pg_trgm GIN indeksi `LIKE '%…%'` ve `ILIKE '%…%'` desenlerini karşılar.
-- İki kolon da indeksleniyor çünkü arama ikisine birden bakıyor: `searchText`
-- (TR-katlanmış, esas yol) ve `nameTr` (searchText'i boş kalmış satırlar için
-- yedek, `mode: insensitive`).
--
-- SINIR: trigram indeksi ≥3 karakterlik desenlerde çalışır. Arama 2 karakterden
-- kısa sorguyu zaten reddediyor; 2 karakterlik sorgu tam taramaya düşer (kabul).
--
-- KİLİT: `CREATE INDEX` (CONCURRENTLY DEĞİL) bilinçli — Prisma migration'ı
-- transaction'a sarar, CONCURRENTLY transaction içinde çalışmaz. Güvenli olmasının
-- sebebi tablonun küçük olması (bu migration anında 22.106 satır; indeks kurulumu
-- saniyeler) ve `categories`'in istek yolunda YALNIZ okunması.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "categories_searchText_trgm_idx"
  ON "categories" USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "categories_nameTr_trgm_idx"
  ON "categories" USING GIN ("nameTr" gin_trgm_ops);
