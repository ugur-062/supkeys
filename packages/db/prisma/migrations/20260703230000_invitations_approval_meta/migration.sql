-- CreateEnum
CREATE TYPE "CompanyInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "company_user_invitations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "CompanyRole"[] DEFAULT ARRAY[]::"CompanyRole"[],
    "token" TEXT NOT NULL,
    "status" "CompanyInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_user_invitations_token_key" ON "company_user_invitations"("token");
CREATE INDEX "company_user_invitations_companyId_status_idx" ON "company_user_invitations"("companyId", "status");
CREATE INDEX "company_user_invitations_email_status_idx" ON "company_user_invitations"("email", "status");

-- AddForeignKey
ALTER TABLE "company_user_invitations" ADD CONSTRAINT "company_user_invitations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approval meta
ALTER TABLE "approval_flow_steps" ADD COLUMN "displayLabel" TEXT;
ALTER TABLE "approval_request_steps" ADD COLUMN "displayLabel" TEXT;
ALTER TABLE "approval_requests" ADD COLUMN "requestNo" TEXT;
ALTER TABLE "approval_requests" ADD COLUMN "initiatorNote" TEXT;
CREATE UNIQUE INDEX "approval_requests_companyId_requestNo_key" ON "approval_requests"("companyId", "requestNo");
