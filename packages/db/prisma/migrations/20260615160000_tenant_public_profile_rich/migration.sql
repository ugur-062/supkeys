-- Alıcı public profili — zengin alanlar (tedarikçi profili paritesi).
ALTER TABLE "tenants"
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "instagramUrl" TEXT,
  ADD COLUMN "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "foundedYear" INTEGER,
  ADD COLUMN "employeeCount" TEXT,
  ADD COLUMN "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
