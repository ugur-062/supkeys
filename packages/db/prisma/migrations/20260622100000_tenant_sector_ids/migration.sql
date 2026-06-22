-- Madde 29 — alıcı faaliyet sektörü (UNSPSC segment ID'leri).
ALTER TABLE "tenants" ADD COLUMN "sectorCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
