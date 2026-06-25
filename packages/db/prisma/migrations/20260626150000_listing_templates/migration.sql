CREATE TABLE "listing_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "listing_templates_companyId_idx" ON "listing_templates"("companyId");
ALTER TABLE "listing_templates" ADD CONSTRAINT "listing_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
