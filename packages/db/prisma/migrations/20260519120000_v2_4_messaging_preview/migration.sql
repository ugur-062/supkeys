-- V2-4 düzeltme — header dropdown + /mesajlar sayfası için son mesaj preview
-- cache'i. sendMessage'da set edilir.

ALTER TABLE "message_threads"
  ADD COLUMN IF NOT EXISTS "lastMessagePreview" VARCHAR(200);
