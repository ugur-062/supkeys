-- İlan görünürlüğü (PUBLIC/CONNECTIONS/PRIVATE).
CREATE TYPE "ListingVisibility" AS ENUM ('PUBLIC', 'CONNECTIONS', 'PRIVATE');
ALTER TABLE "listings" ADD COLUMN "visibility" "ListingVisibility" NOT NULL DEFAULT 'CONNECTIONS';
