-- V2-6.5 — Tenant başına BUYER (Satın Almacı) kontenjanı.
-- Super-admin yönetir. APPROVER ve COMPANY_ADMIN sayılmaz; sadece role = BUYER sayılır.
-- Default 2.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "buyerSeatLimit" INTEGER NOT NULL DEFAULT 2;
