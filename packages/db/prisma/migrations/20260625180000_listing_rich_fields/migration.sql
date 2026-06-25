-- Zengin ilan: yurtiçi/uluslararası + format (alış) + min/hemen-al (satış).
CREATE TYPE "ListingFormat" AS ENUM ('RFQ', 'ENGLISH_AUCTION');
ALTER TABLE "listings" ADD COLUMN "isInternational" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "listings" ADD COLUMN "format" "ListingFormat";
ALTER TABLE "listings" ADD COLUMN "minPrice" DECIMAL(18,2);
ALTER TABLE "listings" ADD COLUMN "buyNowPrice" DECIMAL(18,2);
