-- Category.keywords — küratörlü eşanlamlı/jargon listesi (category-keywords.tsv).
-- Sahadaki terimler UNSPSC adlarıyla örtüşmüyor ("telfer", "transpalet",
-- "hilti"...); bu kolon searchText'e katlanarak dahil edilir, arama yalnız
-- searchText üzerinden yapılır. Backfill yok — apply-category-keywords
-- script'i (veya seed) doldurur. NOT NULL + sabit DEFAULT = metadata-only.
ALTER TABLE "categories" ADD COLUMN "keywords" TEXT NOT NULL DEFAULT '';
