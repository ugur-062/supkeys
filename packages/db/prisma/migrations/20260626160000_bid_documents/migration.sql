CREATE TABLE "listing_bid_documents" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByCompanyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_bid_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "listing_bid_documents_bidId_idx" ON "listing_bid_documents"("bidId");
ALTER TABLE "listing_bid_documents" ADD CONSTRAINT "listing_bid_documents_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "listing_bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
