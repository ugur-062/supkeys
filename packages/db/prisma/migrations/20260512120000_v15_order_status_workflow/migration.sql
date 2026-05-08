-- V1.5 Oturum 1 — Order workflow + IN_DELIVERY enum
-- Manuel uygulanır.

-- 1) OrderStatus enum'una IN_DELIVERY ekle (PENDING'den sonra)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'IN_DELIVERY'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'IN_DELIVERY' AFTER 'PENDING';
  END IF;
END $$;

-- 2) Order tablosuna workflow alanları
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "deliveryStartedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryStartedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryNote"         TEXT,
  ADD COLUMN IF NOT EXISTS "expectedDeliveryDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedById"        TEXT,
  ADD COLUMN IF NOT EXISTS "completedNote"        TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById"        TEXT,
  ADD COLUMN IF NOT EXISTS "cancelReason"         TEXT;
