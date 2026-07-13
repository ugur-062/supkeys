-- Faz 2 — Yeni ödeme modeli: paymentTerm(CASH/DEFERRED)+paymentTiming sorusu
-- yerine kategori tabanlı ödeme planı. paymentTiming artık plandan TÜRETİLİR.
-- Siparişe award-anı snapshot alanları eklenir (ilan SetNull — öksüz kalmasın).

CREATE TYPE "ListingPaymentCategory" AS ENUM ('ADVANCE', 'DEFERRED', 'OPEN_ACCOUNT', 'CHEQUE', 'LETTER_OF_CREDIT', 'CUSTOM');
CREATE TYPE "LcType" AS ENUM ('SIGHT', 'USANCE');

ALTER TABLE "listings"
  ADD COLUMN "paymentCategory" "ListingPaymentCategory" NOT NULL DEFAULT 'OPEN_ACCOUNT',
  ADD COLUMN "advancePercent" INTEGER,
  ADD COLUMN "lcType" "LcType",
  ADD COLUMN "lcConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentNote" TEXT;

-- S6 eşlemesi: CASH+BEFORE → Peşin %100; CASH+AFTER → Açık Hesap (teslimatta
-- peşin, Peşin'e EŞLENEMEZ çünkü yeni modelde Peşin = teslim öncesi yüzde);
-- DEFERRED → Vadeli (vade günü korunur, timing AFTER'a normalize).
UPDATE "listings" SET "paymentCategory" = 'ADVANCE', "advancePercent" = 100
  WHERE "paymentTerm" = 'CASH' AND "paymentTiming" = 'BEFORE_DELIVERY';
UPDATE "listings" SET "paymentCategory" = 'OPEN_ACCOUNT'
  WHERE "paymentTerm" = 'CASH' AND "paymentTiming" = 'AFTER_DELIVERY';
UPDATE "listings" SET "paymentCategory" = 'DEFERRED', "paymentTiming" = 'AFTER_DELIVERY'
  WHERE "paymentTerm" = 'DEFERRED';

ALTER TABLE "listings" DROP COLUMN "paymentTerm";
DROP TYPE "ListingPaymentTerm";

-- Sipariş snapshot alanları (S2).
ALTER TABLE "company_orders"
  ADD COLUMN "paymentCategory" "ListingPaymentCategory" NOT NULL DEFAULT 'OPEN_ACCOUNT',
  ADD COLUMN "advancePercent" INTEGER,
  ADD COLUMN "paymentDays" INTEGER,
  ADD COLUMN "lcType" "LcType",
  ADD COLUMN "lcConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentNote" TEXT,
  ADD COLUMN "deliveryTerm" "ListingDeliveryTerm";

-- Backfill: ilanı duran siparişler ilanın (az önce eşlenen) planından.
UPDATE "company_orders" o SET
  "paymentCategory" = l."paymentCategory",
  "advancePercent"  = l."advancePercent",
  "paymentDays"     = l."paymentDays",
  "lcType"          = l."lcType",
  "lcConfirmed"     = l."lcConfirmed",
  "paymentNote"     = l."paymentNote",
  "deliveryTerm"    = l."deliveryTerm"
FROM "listings" l WHERE o."listingId" = l."id";

-- Öksüz siparişler (listingId NULL) kendi zamanlamasından: BEFORE → Peşin %100;
-- AFTER → Açık Hesap (kolon default'u zaten OPEN_ACCOUNT).
UPDATE "company_orders" SET "paymentCategory" = 'ADVANCE', "advancePercent" = 100
  WHERE "listingId" IS NULL AND "paymentTiming" = 'BEFORE_DELIVERY';
