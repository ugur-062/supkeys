-- Manual SQL applied (Prisma migrate dev would reset dev DB due to drift baseline).

ALTER TABLE "bids"
  ADD COLUMN IF NOT EXISTS "eliminationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "eliminatedAt" TIMESTAMP(3);
