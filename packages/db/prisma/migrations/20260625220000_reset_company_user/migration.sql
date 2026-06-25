-- Parola sıfırlama: company kullanıcısı desteği
ALTER TABLE "password_reset_tokens" ADD COLUMN "companyUserId" TEXT;
CREATE INDEX "password_reset_tokens_companyUserId_idx" ON "password_reset_tokens"("companyUserId");
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
