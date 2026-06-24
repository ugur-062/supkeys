-- Yurtdışı firma kaydı — ülke + eyalet/bölge alanları.
ALTER TABLE "tenants"   ADD COLUMN "country" TEXT NOT NULL DEFAULT 'TR';
ALTER TABLE "tenants"   ADD COLUMN "stateRegion" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'TR';
ALTER TABLE "suppliers" ADD COLUMN "stateRegion" TEXT;
