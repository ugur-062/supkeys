-- G5 madde 12/14 — Sipariş "Gönderildi" aşamasında tedarikçinin gireceği
-- fatura numarası. Şemada nullable; uygulama katmanında gönderim için zorunlu.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;
