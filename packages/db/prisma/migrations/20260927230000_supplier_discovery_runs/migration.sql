-- AI TEDARİKÇİ KEŞFİ TURLARI (2026-09-27, Faz 1). Tamamen EKLEMELİ:
--   · listings.aiDiscovery (yayında otomatik arama), listings.inviteShowName
--     (davette firma adı; varsayılan açık)
--   · supplier_discovery_runs + supplier_discovery_candidates

-- CreateEnum
CREATE TYPE "DiscoveryTrigger" AS ENUM ('FORM', 'PUBLISH', 'SECOND_ROUND', 'MANUAL');

-- CreateEnum
CREATE TYPE "DiscoveryRunState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "aiDiscovery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "inviteShowName" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "supplier_discovery_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "listingId" TEXT,
    "trigger" "DiscoveryTrigger" NOT NULL,
    "state" "DiscoveryRunState" NOT NULL DEFAULT 'PENDING',
    "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "costUsd" DECIMAL(10,4),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_discovery_candidates" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "website" TEXT,
    "city" TEXT,
    "country" TEXT,
    "reason" TEXT,
    "matchedItems" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "recentlyInvited" BOOLEAN NOT NULL DEFAULT false,
    "memberCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_discovery_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_discovery_runs_listingId_createdAt_idx" ON "supplier_discovery_runs"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "supplier_discovery_runs_state_createdAt_idx" ON "supplier_discovery_runs"("state", "createdAt");

-- CreateIndex
CREATE INDEX "supplier_discovery_candidates_runId_idx" ON "supplier_discovery_candidates"("runId");

-- AddForeignKey
ALTER TABLE "supplier_discovery_runs" ADD CONSTRAINT "supplier_discovery_runs_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_discovery_candidates" ADD CONSTRAINT "supplier_discovery_candidates_runId_fkey" FOREIGN KEY ("runId") REFERENCES "supplier_discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "supplier_discovery_runs" TO rothern_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "supplier_discovery_candidates" TO rothern_app;
  END IF;
END $$;
