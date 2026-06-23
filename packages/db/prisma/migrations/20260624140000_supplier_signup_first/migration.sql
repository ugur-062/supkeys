-- Madde 29 — tedarikçi hesabı şirket bilgisinden önce (signup) oluşur.
ALTER TABLE "suppliers" ALTER COLUMN "taxNumber" DROP NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "taxCertUrl" DROP NOT NULL;
ALTER TABLE "supplier_users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
-- Mevcut tedarikçi kullanıcıları zaten doğrulanmış say (login engellenmesin).
UPDATE "supplier_users" SET "emailVerifiedAt" = "createdAt";
