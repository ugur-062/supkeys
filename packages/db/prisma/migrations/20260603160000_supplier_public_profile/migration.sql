-- V2-PUBLIC-PROFILE — PREMIUM tedarikçilerin herkese açık profil altyapısı.
-- Supplier'a public profil alanları + galeri için SupplierPhoto modeli.

-- AlterTable: suppliers'a public profil alanları
ALTER TABLE "suppliers" ADD COLUMN "slug" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "publicEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "suppliers" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "aboutText" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "services" TEXT[] NOT NULL DEFAULT '{}';

-- Unique constraint: slug (nullable unique — null'lar çakışmaz)
CREATE UNIQUE INDEX "suppliers_slug_key" ON "suppliers"("slug");

-- CreateTable: supplier_photos (galeri)
CREATE TABLE "supplier_photos" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_photos_supplierId_idx" ON "supplier_photos"("supplierId");

-- FK: supplier_photos.supplierId → suppliers.id
ALTER TABLE "supplier_photos" ADD CONSTRAINT "supplier_photos_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
