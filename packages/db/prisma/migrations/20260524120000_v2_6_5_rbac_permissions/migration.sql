-- V2-6.5 — RBAC: kullanıcı bazlı permission override.
-- User.permissionsOverride Json? — null = saf role default;
-- dolu = { added?: string[], removed?: string[] } şeklinde role'den eklenen/eksiltilen yetkiler.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissionsOverride" JSONB;
