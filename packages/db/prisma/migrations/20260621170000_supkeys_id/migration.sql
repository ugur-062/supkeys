-- Faz 3 madde 6 — kalıcı Supkeys ID (alıcı + tedarikçi). Nullable + unique;
-- mevcut satırlar backfill script ile doldurulur (uniq Crockford kod).
ALTER TABLE "tenants" ADD COLUMN "supkeysId" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "supkeysId" TEXT;

CREATE UNIQUE INDEX "tenants_supkeysId_key" ON "tenants"("supkeysId");
CREATE UNIQUE INDEX "suppliers_supkeysId_key" ON "suppliers"("supkeysId");
