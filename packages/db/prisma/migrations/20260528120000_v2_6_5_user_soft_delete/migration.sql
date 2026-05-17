-- V2-6.5 — User soft delete + anonymization.
-- Firma yöneticisinin "Sil" aksiyonu için. Hard delete YOK — Tender/Order
-- referansları korunur. deletedAt=now + isActive=false + kişisel veri
-- anonimleştirme uygulama katmanında yapılır.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_tenantId_deletedAt_idx"
  ON "users"("tenantId", "deletedAt");
