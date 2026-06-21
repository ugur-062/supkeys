-- G5 madde 11 — "Fatura kesim tarihi" kaldırıldı. Fatura no, gönderim
-- aşamasında girilecek (madde 12/14); fatura kesim tarihi alanı artık yok.

ALTER TABLE "orders" DROP COLUMN IF EXISTS "invoiceDate";
