-- AI'IN ÖNERDİĞİ ÜYEYE DOĞRUDAN TALEP DAVETİ (2026-09-28). EKLEMELİ.
--   · listing_invitations.origin ("AI" = keşif önerisi, bağlantı şartı yok) + aiReason
--   · supplier_discovery_candidates.matchedCategories + source (PLATFORM/WEB/BOTH)

-- AlterTable
ALTER TABLE "listing_invitations" ADD COLUMN "origin" TEXT,
ADD COLUMN "aiReason" JSONB;

-- AlterTable
ALTER TABLE "supplier_discovery_candidates" ADD COLUMN "matchedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "source" TEXT;
