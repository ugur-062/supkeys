-- CreateTable
CREATE TABLE "listing_round_snapshots" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "bidderName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_round_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_round_snapshots_listingId_idx" ON "listing_round_snapshots"("listingId");

-- AddForeignKey
ALTER TABLE "listing_round_snapshots" ADD CONSTRAINT "listing_round_snapshots_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

