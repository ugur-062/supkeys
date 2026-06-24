-- Kategori birleştirme — ana (segment) + alt (sınırsız) UNSPSC kategorileri.
-- Tenant: subCategoryIds. Supplier: sectorCategoryIds (UNSPSC'ye geçiş) + subCategoryIds.
ALTER TABLE "tenants" ADD COLUMN "subCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "suppliers" ADD COLUMN "sectorCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "suppliers" ADD COLUMN "subCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
