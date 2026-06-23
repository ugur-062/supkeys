-- Tedarikçi: kürasyonlu faaliyet sektörleri + teslimat adresi (onboarding).
ALTER TABLE "suppliers"
  ADD COLUMN "sectors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "deliveryCity" TEXT,
  ADD COLUMN "deliveryDistrict" TEXT,
  ADD COLUMN "deliveryNeighborhood" TEXT,
  ADD COLUMN "deliveryAddressLine" TEXT,
  ADD COLUMN "deliveryPostalCode" TEXT;
