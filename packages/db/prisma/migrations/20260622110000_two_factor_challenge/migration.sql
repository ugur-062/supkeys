-- Madde 29 — FAZ 3.3: e-posta 2FA OTP challenge tablosu.
CREATE TABLE "two_factor_challenges" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "supplierUserId" TEXT,
  "purpose" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "two_factor_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "two_factor_challenges_userId_idx" ON "two_factor_challenges"("userId");
CREATE INDEX "two_factor_challenges_supplierUserId_idx" ON "two_factor_challenges"("supplierUserId");
