-- Birleşik sistem — İlan (Listing) Company-native model (additive).
CREATE TYPE "ListingType" AS ENUM ('ALIM', 'SATIS');
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'AWARDED', 'CANCELLED');

CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'OPEN',
    "closesAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "listings_companyId_idx" ON "listings"("companyId");
CREATE INDEX "listings_status_idx" ON "listings"("status");

ALTER TABLE "listings" ADD CONSTRAINT "listings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
