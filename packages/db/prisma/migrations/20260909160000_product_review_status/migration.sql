-- Ürün moderasyonu (2026-09-09): her ürün vitrine çıkmadan admin onayından geçer.
--
-- Yeni enum + 5 kolon; `reviewStatus` NOT NULL ama DEFAULT'lu (tablo küçük,
-- kilit anlık). Backfill: bugün YAYINDA olan ürünler APPROVED sayılır — kimse
-- vitrinden düşmez; taslaklar DRAFT kalır. Yeni enum tipi ile kullanımı aynı
-- migration'da olabilir (sorun yalnız var olan enum'a ADD VALUE + DML'de).
-- Geri dönüş: PITR + snapshot (docs/migration-safety.md Not 2).
CREATE TYPE "ProductReviewStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "company_items"
  ADD COLUMN "reviewStatus" "ProductReviewStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByAdminId" TEXT,
  ADD COLUMN "rejectReason" TEXT;

UPDATE "company_items"
SET "reviewStatus" = 'APPROVED', "reviewedAt" = COALESCE("publishedAt", NOW())
WHERE "isPublic" = true;

CREATE INDEX "company_items_reviewStatus_submittedAt_idx" ON "company_items"("reviewStatus", "submittedAt");
