-- Ziyaret Edenler (2026-09-05): görüntülenme kaydı + gizlilik anahtarı.
-- Eklemeli: yeni enum, yeni tablo, sabit DEFAULT'lu bir kolon (kilit anlık).

-- CreateEnum
CREATE TYPE "CompanyViewSurface" AS ENUM ('PANEL', 'PUBLIC');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "visitsVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "company_views" (
    "id" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "viewerCompanyId" TEXT,
    "viewerUserId" TEXT,
    "productId" TEXT,
    "surface" "CompanyViewSurface" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_views_targetCompanyId_dedupeKey_key" ON "company_views"("targetCompanyId", "dedupeKey");
CREATE INDEX "company_views_targetCompanyId_viewedAt_idx" ON "company_views"("targetCompanyId", "viewedAt");
CREATE INDEX "company_views_viewerCompanyId_viewedAt_idx" ON "company_views"("viewerCompanyId", "viewedAt");
CREATE INDEX "company_views_productId_idx" ON "company_views"("productId");

-- AddForeignKey
ALTER TABLE "company_views" ADD CONSTRAINT "company_views_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_views" ADD CONSTRAINT "company_views_viewerCompanyId_fkey" FOREIGN KEY ("viewerCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_views" ADD CONSTRAINT "company_views_productId_fkey" FOREIGN KEY ("productId") REFERENCES "company_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
