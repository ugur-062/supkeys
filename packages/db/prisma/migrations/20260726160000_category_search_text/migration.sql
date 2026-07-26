-- Category.searchText — TR-katlanmış arama metni.
-- Postgres lower('İ') = "i + combining dot" olduğundan ILIKE '%iskele%'
-- "İskele..." satırlarını bulamıyordu; ayrıca aksansız yazım ("jenerator")
-- eşleşmiyordu. Kolon foldSearchText(nameTr) ile doldurulur (seed), sorgu
-- tarafı da aynı fold'dan geçer. NOT NULL + sabit DEFAULT = metadata-only,
-- rewrite/kilit yok (migration-safety "güvenli desenler").
ALTER TABLE "categories" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

-- Backfill: mevcut satırlar için SQL-tarafı fold (translate lower'dan ÖNCE —
-- 'İ' sorunu). JS foldSearchText ile aynı sonuç: TR harfler + şapkalı â/î/û
-- ASCII'ye eşlenir. Sonraki seed koşumları JS fold'uyla yazar.
UPDATE "categories"
SET "searchText" = lower(translate("nameTr", 'çÇşŞğĞüÜöÖıİâÂîÎûÛ', 'ccssgguuooiiaaiiuu'));
