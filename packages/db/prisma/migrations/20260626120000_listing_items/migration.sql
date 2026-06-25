-- Listing ihale zenginleştirme (eski alıcı paneli)
ALTER TABLE "listings" ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "listings" ADD COLUMN "terms" TEXT;
ALTER TABLE "listings" ADD COLUMN "internalNotes" TEXT;
ALTER TABLE "listings" ADD COLUMN "requireAllItems" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "listings" ADD COLUMN "requireBidDocument" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "listings" ADD COLUMN "primaryCurrency" "Currency" NOT NULL DEFAULT 'TRY';
ALTER TABLE "listings" ADD COLUMN "allowedCurrencies" "Currency"[] NOT NULL DEFAULT ARRAY[]::"Currency"[];

ALTER TABLE "listing_bids" ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'TRY';

CREATE TABLE "listing_items" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "targetPrice" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "listing_items_listingId_idx" ON "listing_items"("listingId");

CREATE TABLE "listing_invitations" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "invitedCompanyId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "listing_invitations_listingId_invitedCompanyId_key" ON "listing_invitations"("listingId", "invitedCompanyId");
CREATE INDEX "listing_invitations_invitedCompanyId_idx" ON "listing_invitations"("invitedCompanyId");

CREATE TABLE "listing_bid_items" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    CONSTRAINT "listing_bid_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "listing_bid_items_bidId_itemId_key" ON "listing_bid_items"("bidId", "itemId");
CREATE INDEX "listing_bid_items_bidId_idx" ON "listing_bid_items"("bidId");

ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_invitations" ADD CONSTRAINT "listing_invitations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_invitations" ADD CONSTRAINT "listing_invitations_invitedCompanyId_fkey" FOREIGN KEY ("invitedCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_bid_items" ADD CONSTRAINT "listing_bid_items_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "listing_bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_bid_items" ADD CONSTRAINT "listing_bid_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "listing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
