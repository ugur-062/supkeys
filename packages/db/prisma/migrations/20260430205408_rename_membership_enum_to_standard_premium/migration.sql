-- Rename SupplierMembership: BRONZE → STANDARD, SILVER → PREMIUM

-- 1. Yeni enum oluştur
CREATE TYPE "SupplierMembership_new" AS ENUM ('STANDARD', 'PREMIUM');

-- 2. Mevcut sütunu yeni enum'a çevir, eski değerleri map'le
ALTER TABLE "suppliers"
  ALTER COLUMN "membership" DROP DEFAULT,
  ALTER COLUMN "membership" TYPE "SupplierMembership_new"
  USING (
    CASE "membership"::text
      WHEN 'BRONZE' THEN 'STANDARD'::"SupplierMembership_new"
      WHEN 'SILVER' THEN 'PREMIUM'::"SupplierMembership_new"
    END
  );

-- 3. Eski enum'u sil, yeni enum'u eski isme yeniden adlandır
DROP TYPE "SupplierMembership";
ALTER TYPE "SupplierMembership_new" RENAME TO "SupplierMembership";

-- 4. Default'u tekrar ekle
ALTER TABLE "suppliers" ALTER COLUMN "membership" SET DEFAULT 'STANDARD';
