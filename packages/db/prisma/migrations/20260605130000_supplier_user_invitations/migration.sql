-- Ekip — tedarikçi firmasına yeni çalışan davet tablosu (rolsüz).
-- "UserInvitationStatus" enum tipi user_invitations migration'ında oluşturuldu.

CREATE TABLE "supplier_user_invitations" (
  "id"          TEXT NOT NULL,
  "supplierId"  TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "status"      "UserInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "acceptedAt"  TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_user_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_user_invitations_token_key" ON "supplier_user_invitations"("token");
CREATE INDEX "supplier_user_invitations_supplierId_email_status_idx" ON "supplier_user_invitations"("supplierId", "email", "status");
CREATE INDEX "supplier_user_invitations_token_idx" ON "supplier_user_invitations"("token");

ALTER TABLE "supplier_user_invitations"
  ADD CONSTRAINT "supplier_user_invitations_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_user_invitations"
  ADD CONSTRAINT "supplier_user_invitations_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "supplier_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
