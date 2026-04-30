-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING_EMAIL_VERIFICATION', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('JOINT_STOCK', 'LIMITED', 'SOLE_PROPRIETOR');

-- CreateEnum
CREATE TYPE "SupplierMembership" AS ENUM ('BRONZE', 'SILVER');

-- CreateEnum
CREATE TYPE "RelationStatus" AS ENUM ('ACTIVE', 'PENDING_TENANT_APPROVAL', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "taxNumber" TEXT,
ADD COLUMN     "taxOffice" TEXT;

-- CreateTable
CREATE TABLE "buyer_applications" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyType" "CompanyType" NOT NULL,
    "taxNumber" TEXT NOT NULL,
    "taxOffice" TEXT NOT NULL,
    "taxCertUrl" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "postalCode" TEXT,
    "adminFirstName" TEXT NOT NULL,
    "adminLastName" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "adminPhone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
    "emailToken" TEXT,
    "emailTokenExp" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "tenantId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_applications" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyType" "CompanyType" NOT NULL,
    "taxNumber" TEXT NOT NULL,
    "taxOffice" TEXT NOT NULL,
    "taxCertUrl" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "postalCode" TEXT,
    "adminFirstName" TEXT NOT NULL,
    "adminLastName" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "adminPhone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
    "emailToken" TEXT,
    "emailTokenExp" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "invitationId" TEXT,
    "invitedByTenantId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "supplierId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyType" "CompanyType" NOT NULL,
    "taxNumber" TEXT NOT NULL,
    "taxOffice" TEXT NOT NULL,
    "taxCertUrl" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "postalCode" TEXT,
    "membership" "SupplierMembership" NOT NULL DEFAULT 'BRONZE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT NOT NULL,

    CONSTRAINT "supplier_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_tenant_relations" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "RelationStatus" NOT NULL DEFAULT 'ACTIVE',
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_tenant_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactName" TEXT,
    "message" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "acceptedBySupplierId" TEXT,
    "sentCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buyer_applications_emailToken_key" ON "buyer_applications"("emailToken");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_applications_tenantId_key" ON "buyer_applications"("tenantId");

-- CreateIndex
CREATE INDEX "buyer_applications_status_idx" ON "buyer_applications"("status");

-- CreateIndex
CREATE INDEX "buyer_applications_adminEmail_idx" ON "buyer_applications"("adminEmail");

-- CreateIndex
CREATE INDEX "buyer_applications_createdAt_idx" ON "buyer_applications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_applications_adminEmail_status_key" ON "buyer_applications"("adminEmail", "status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_applications_emailToken_key" ON "supplier_applications"("emailToken");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_applications_invitationId_key" ON "supplier_applications"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_applications_supplierId_key" ON "supplier_applications"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_applications_status_idx" ON "supplier_applications"("status");

-- CreateIndex
CREATE INDEX "supplier_applications_adminEmail_idx" ON "supplier_applications"("adminEmail");

-- CreateIndex
CREATE INDEX "supplier_applications_invitedByTenantId_idx" ON "supplier_applications"("invitedByTenantId");

-- CreateIndex
CREATE INDEX "supplier_applications_createdAt_idx" ON "supplier_applications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_taxNumber_key" ON "suppliers"("taxNumber");

-- CreateIndex
CREATE INDEX "suppliers_taxNumber_idx" ON "suppliers"("taxNumber");

-- CreateIndex
CREATE INDEX "suppliers_membership_idx" ON "suppliers"("membership");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_users_email_key" ON "supplier_users"("email");

-- CreateIndex
CREATE INDEX "supplier_users_supplierId_idx" ON "supplier_users"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_tenant_relations_tenantId_idx" ON "supplier_tenant_relations"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_tenant_relations_supplierId_idx" ON "supplier_tenant_relations"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_tenant_relations_supplierId_tenantId_key" ON "supplier_tenant_relations"("supplierId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invitations_tokenHash_key" ON "supplier_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "supplier_invitations_tenantId_idx" ON "supplier_invitations"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_invitations_email_idx" ON "supplier_invitations"("email");

-- CreateIndex
CREATE INDEX "supplier_invitations_status_idx" ON "supplier_invitations"("status");

-- CreateIndex
CREATE INDEX "supplier_invitations_expiresAt_idx" ON "supplier_invitations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_taxNumber_key" ON "tenants"("taxNumber");

-- AddForeignKey
ALTER TABLE "buyer_applications" ADD CONSTRAINT "buyer_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_applications" ADD CONSTRAINT "buyer_applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_applications" ADD CONSTRAINT "supplier_applications_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "supplier_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_applications" ADD CONSTRAINT "supplier_applications_invitedByTenantId_fkey" FOREIGN KEY ("invitedByTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_applications" ADD CONSTRAINT "supplier_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_applications" ADD CONSTRAINT "supplier_applications_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_users" ADD CONSTRAINT "supplier_users_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_tenant_relations" ADD CONSTRAINT "supplier_tenant_relations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_tenant_relations" ADD CONSTRAINT "supplier_tenant_relations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invitations" ADD CONSTRAINT "supplier_invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invitations" ADD CONSTRAINT "supplier_invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invitations" ADD CONSTRAINT "supplier_invitations_acceptedBySupplierId_fkey" FOREIGN KEY ("acceptedBySupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

