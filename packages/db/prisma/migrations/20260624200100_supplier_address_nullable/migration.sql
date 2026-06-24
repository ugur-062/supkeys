-- Yabancı firma için Supplier.taxOffice + district nullable (TR'ye özgü alanlar).
ALTER TABLE "suppliers" ALTER COLUMN "taxOffice" DROP NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "district" DROP NOT NULL;
