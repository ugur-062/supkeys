-- İhale + teklif belgelerini bölümlere ayır (kind).
CREATE TYPE "ListingDocKind" AS ENUM ('IDARI_SARTNAME', 'TEKNIK_SARTNAME', 'SOZLESME', 'EK', 'NUMUNE', 'DIGER');
CREATE TYPE "ListingBidDocKind" AS ENUM ('TEKLIF_MEKTUBU', 'TEKNIK_DOKUMAN', 'REFERANS', 'KATALOG', 'TEMINAT', 'DIGER');

ALTER TABLE "listing_documents" ADD COLUMN "kind" "ListingDocKind" NOT NULL DEFAULT 'DIGER';
ALTER TABLE "listing_bid_documents" ADD COLUMN "kind" "ListingBidDocKind" NOT NULL DEFAULT 'DIGER';
