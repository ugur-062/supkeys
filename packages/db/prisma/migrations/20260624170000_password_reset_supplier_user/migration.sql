-- Faz 1 — tedarikçi (SupplierUser) parola sıfırlama desteği.
-- Token artık alıcı (User) VEYA tedarikçi (SupplierUser) kullanıcısına bağlanır.
ALTER TABLE "password_reset_tokens" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "password_reset_tokens" ADD COLUMN "supplierUserId" TEXT;
CREATE INDEX "password_reset_tokens_supplierUserId_idx" ON "password_reset_tokens"("supplierUserId");
ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_supplierUserId_fkey"
  FOREIGN KEY ("supplierUserId") REFERENCES "supplier_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
