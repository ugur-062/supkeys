-- V2-PUBLIC-PROFILE-DETAILS — Detaylı profil alanları (kuruluş, ekip, sertifika).

ALTER TABLE "suppliers" ADD COLUMN "foundedYear" INTEGER;
ALTER TABLE "suppliers" ADD COLUMN "employeeCount" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "certifications" TEXT[] NOT NULL DEFAULT '{}';
