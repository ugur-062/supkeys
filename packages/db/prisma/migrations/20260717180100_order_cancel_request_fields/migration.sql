-- A1: satıcı iptal talebi alanları (order üzerinde; ayrı tablo yok — kanıt izi
-- audit_logs'ta). Açık talep = status=ACCEPTED && cancelRequestedAt IS NOT NULL.
-- DISPUTED enum değerini KULLANMAZ → güvenli (kolonlar).

ALTER TABLE "company_orders"
  ADD COLUMN "cancelRequestedAt"   TIMESTAMP(3),
  ADD COLUMN "cancelRequestReason" TEXT,
  ADD COLUMN "cancelRequestById"   TEXT,
  ADD COLUMN "disputedAt"          TIMESTAMP(3);
