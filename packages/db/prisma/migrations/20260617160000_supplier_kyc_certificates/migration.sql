-- G9 madde 26 — tedarikçi sertifikaları + madde 27 — başvuru KYC belgeleri.

ALTER TABLE "supplier_applications"
  ADD COLUMN "ticariSicilUrl" TEXT,
  ADD COLUMN "imzaSirkuleriUrl" TEXT,
  ADD COLUMN "bankaOnayliIbanUrl" TEXT;

CREATE TABLE "supplier_certificates" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_certificates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_certificates_supplierId_idx" ON "supplier_certificates"("supplierId");
ALTER TABLE "supplier_certificates" ADD CONSTRAINT "supplier_certificates_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
