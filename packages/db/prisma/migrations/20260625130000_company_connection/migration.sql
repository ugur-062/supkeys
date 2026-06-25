-- Birleşik sistem — CompanyConnection (davet→kabul, origin) additive.
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE');
CREATE TYPE "ConnectionOrigin" AS ENUM ('INVITE', 'PREMIUM', 'ADMIN');

CREATE TABLE "company_connections" (
    "id" TEXT NOT NULL,
    "inviterCompanyId" TEXT NOT NULL,
    "inviteeCompanyId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ConnectionOrigin" NOT NULL DEFAULT 'INVITE',
    "invitedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_connections_inviteeCompanyId_idx" ON "company_connections"("inviteeCompanyId");
CREATE UNIQUE INDEX "company_connections_inviterCompanyId_inviteeCompanyId_key" ON "company_connections"("inviterCompanyId", "inviteeCompanyId");

ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_inviterCompanyId_fkey" FOREIGN KEY ("inviterCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_inviteeCompanyId_fkey" FOREIGN KEY ("inviteeCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
