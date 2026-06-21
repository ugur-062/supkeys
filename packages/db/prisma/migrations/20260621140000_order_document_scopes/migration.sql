-- G5 madde 19/21 — sipariş belge kategorileri. AttachmentScope enum'una
-- proforma / teknik / Teslimat Evrakları değerleri eklenir (ORDER_INVOICE
-- zaten vardı). PostgreSQL 12+ ADD VALUE'yu transaction içinde destekler.

ALTER TYPE "AttachmentScope" ADD VALUE IF NOT EXISTS 'ORDER_PROFORMA';
ALTER TYPE "AttachmentScope" ADD VALUE IF NOT EXISTS 'ORDER_TECHNICAL';
ALTER TYPE "AttachmentScope" ADD VALUE IF NOT EXISTS 'ORDER_DELIVERY';
