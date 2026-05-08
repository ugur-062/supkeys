-- V1.5 Oturum 2 — Approval reminder idempotency
-- Manuel uygulanır.

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
