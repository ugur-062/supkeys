-- Birleşik sistem — ListingBid (ilana teklif) additive.
CREATE TYPE "ListingBidStatus" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'WON', 'LOST');

CREATE TABLE "listing_bids" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderCompanyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "status" "ListingBidStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listing_bids_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "listing_bids_listingId_idx" ON "listing_bids"("listingId");
CREATE INDEX "listing_bids_bidderCompanyId_idx" ON "listing_bids"("bidderCompanyId");
CREATE UNIQUE INDEX "listing_bids_listingId_bidderCompanyId_key" ON "listing_bids"("listingId", "bidderCompanyId");

ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_bidderCompanyId_fkey" FOREIGN KEY ("bidderCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
