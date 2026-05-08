-- E.7.A — Settings + User Management:
-- 1. User'a phone, invitedById, invitedAt, notificationPrefs ekle
-- 2. UserInvitation tablosu + UserInvitationStatus enum
-- (UserRole.APPROVER zaten var; lastLoginAt zaten var)
--
-- Manuel uygulanır (proje pattern'ı — prisma migrate dev kullanılmaz).

-- 1) User columns
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "invitedById" TEXT,
  ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;

-- Self-relation FK (User → User invitedBy)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_invitedById_fkey'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_invitedById_fkey"
      FOREIGN KEY ("invitedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) UserInvitationStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserInvitationStatus') THEN
    CREATE TYPE "UserInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');
  END IF;
END $$;

-- 3) UserInvitation tablosu
CREATE TABLE IF NOT EXISTS "user_invitations" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "role"        "UserRole" NOT NULL,
  "token"       TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "status"      "UserInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "acceptedAt"  TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_invitations_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_invitations_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_invitations_token_key" ON "user_invitations"("token");
CREATE INDEX IF NOT EXISTS "user_invitations_tenantId_email_status_idx" ON "user_invitations"("tenantId", "email", "status");
CREATE INDEX IF NOT EXISTS "user_invitations_token_idx" ON "user_invitations"("token");
