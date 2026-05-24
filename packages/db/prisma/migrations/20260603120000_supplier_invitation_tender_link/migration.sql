-- V2-7 — SupplierInvitation'ı belirli bir ihaleye bağla (e-posta ile ihale daveti).
-- Davet kabul edilince (kayıtlı tedarikçi direkt, yeni tedarikçi admin onayı sonrası)
-- bu tenderId üzerinden otomatik TenderInvitation oluşturulur.

ALTER TABLE "supplier_invitations"
  ADD COLUMN "tenderId" TEXT;

ALTER TABLE "supplier_invitations"
  ADD CONSTRAINT "supplier_invitations_tenderId_fkey"
  FOREIGN KEY ("tenderId") REFERENCES "tenders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "supplier_invitations_tenderId_idx" ON "supplier_invitations"("tenderId");
