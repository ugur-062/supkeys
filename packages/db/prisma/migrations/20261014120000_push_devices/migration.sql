-- PUSH NOTIFICATION DEVICES (2026-10-14, mobile app shell). ADDITIVE ONLY.
-- One row per FCM registration token of a signed-in company user; the API
-- sends an FCM message for every in-app notification row it writes.
--
-- Only a NEW table: no existing table is touched, no lock/rewrite, no backfill.
-- Rows go with the user (FK cascade) and are deleted when FCM reports the
-- token as unregistered/invalid. "tokenVersion" is the session version the
-- device registered under: once the user's version moves on (password change,
-- reset, dropped sessions) the sender skips and deletes the row.

-- CreateTable
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_companyUserId_idx" ON "push_devices"("companyUserId");

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricted app role (RLS setup) gets write access when it exists. The table
-- is NOT company scoped: no RLS policy (same as revoked_sessions). Account
-- removal paths that run on the restricted client delete rows here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "push_devices" TO rothern_app;
  END IF;
END $$;
