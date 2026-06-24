-- Madde 34 — İhale şablonu.
CREATE TABLE "tender_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tender_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tender_templates_tenantId_idx" ON "tender_templates"("tenantId");
CREATE INDEX "tender_templates_createdById_idx" ON "tender_templates"("createdById");
ALTER TABLE "tender_templates" ADD CONSTRAINT "tender_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_templates" ADD CONSTRAINT "tender_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
