-- CreateTable
CREATE TABLE "listing_documents" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByCompanyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_documents_listingId_idx" ON "listing_documents"("listingId");

-- AddForeignKey
ALTER TABLE "listing_documents" ADD CONSTRAINT "listing_documents_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

