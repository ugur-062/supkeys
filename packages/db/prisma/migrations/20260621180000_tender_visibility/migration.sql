-- Açık İhale — ihale görünürlüğü (PRIVATE=davetli, PUBLIC=herkese açık).
CREATE TYPE "TenderVisibility" AS ENUM ('PRIVATE', 'PUBLIC');
ALTER TABLE "tenders" ADD COLUMN "visibility" "TenderVisibility" NOT NULL DEFAULT 'PRIVATE';
