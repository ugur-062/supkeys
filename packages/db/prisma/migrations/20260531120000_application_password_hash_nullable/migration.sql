-- BuyerApplication/SupplierApplication.passwordHash — Supabase Auth geçişi
-- sonrası onay anında kullanılmıyor (sendPasswordResetEmail tetikleniyor).
-- Kolon nullable; V2'de DROP edilecek.
ALTER TABLE "buyer_applications" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "supplier_applications" ALTER COLUMN "passwordHash" DROP NOT NULL;
