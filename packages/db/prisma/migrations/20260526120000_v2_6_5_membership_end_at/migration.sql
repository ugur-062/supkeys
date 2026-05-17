-- V2-6.5 — Tenant üyelik bitiş tarihi.
-- NULL = sınırsız (legacy/dev). Tarihten sonra tenant kullanıcıları
-- login olamaz; admin login etkilenmez. Super-admin 1-12 ay
-- opsiyonlarıyla uzatır.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "membershipEndAt" TIMESTAMP(3);
