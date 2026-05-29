-- V2-REVIEWS — Sipariş-sonu alıcı değerlendirmesi (1-5 yıldız + opsiyonel metin).
-- Tek sipariş için tek değerlendirme (orderId @unique → idempotent).

CREATE TABLE "supplier_reviews" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_reviews_pkey" PRIMARY KEY ("id")
);

-- 1 sipariş → 1 değerlendirme (idempotent)
CREATE UNIQUE INDEX "supplier_reviews_orderId_key" ON "supplier_reviews"("orderId");

-- Public profil aggregate sorgularını hızlandır
CREATE INDEX "supplier_reviews_supplierId_idx" ON "supplier_reviews"("supplierId");

-- Buyer-side "benim yorumlarım" sorguları için
CREATE INDEX "supplier_reviews_tenantId_idx" ON "supplier_reviews"("tenantId");

-- FK'ler
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- createdBy SetNull: user silinirse review kalır (anonimleşir)
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
