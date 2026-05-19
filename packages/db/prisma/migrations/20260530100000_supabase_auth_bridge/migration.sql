-- Supabase Auth bridge — User/SupplierUser/PlatformAdmin'a authId UUID FK
-- alanları. Nullable başlatılır; mevcut kullanıcı yok (henüz prod yok).
-- Production'da her aktif user için zorunlu hâle gelecek.

ALTER TABLE "users"            ADD COLUMN "authId" TEXT;
ALTER TABLE "supplier_users"   ADD COLUMN "authId" TEXT;
ALTER TABLE "platform_admins"  ADD COLUMN "authId" TEXT;

-- Unique constraint'ler — bir Supabase auth.users kaydı tek bir domain
-- kaydına bağlanır.
CREATE UNIQUE INDEX "users_authId_key"           ON "users"("authId");
CREATE UNIQUE INDEX "supplier_users_authId_key"  ON "supplier_users"("authId");
CREATE UNIQUE INDEX "platform_admins_authId_key" ON "platform_admins"("authId");
