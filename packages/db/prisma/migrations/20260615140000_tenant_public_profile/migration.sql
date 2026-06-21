-- Alıcı public profili — tedarikçilerin gördüğü herkese açık sayfa (/firma/[slug]).
ALTER TABLE "tenants" ADD COLUMN "publicEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "aboutText" TEXT;
ALTER TABLE "tenants" ADD COLUMN "website" TEXT;
ALTER TABLE "tenants" ADD COLUMN "logoUrl" TEXT;
