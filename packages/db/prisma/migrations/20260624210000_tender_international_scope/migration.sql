-- Yurtiçi/Uluslararası ihale ayrımı + yurtiçi teslim şekilleri.
ALTER TABLE "tenders" ADD COLUMN "isInternational" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "DeliveryTerm" ADD VALUE 'DOMESTIC_DELIVERED' BEFORE 'EXW';
ALTER TYPE "DeliveryTerm" ADD VALUE 'DOMESTIC_PICKUP' AFTER 'DOMESTIC_DELIVERED';
