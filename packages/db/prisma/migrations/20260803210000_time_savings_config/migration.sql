-- Zaman Tasarrufu parametreleri: global satır (companyId NULL) + firma override.
CREATE TABLE IF NOT EXISTS "time_savings_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "rfqMailPrepMin" DECIMAL(6,2) NOT NULL DEFAULT 6,
    "followupMin" DECIMAL(6,2) NOT NULL DEFAULT 3,
    "bidToExcelMin" DECIMAL(6,2) NOT NULL DEFAULT 4,
    "bidItemFactor" DECIMAL(4,2) NOT NULL DEFAULT 0.15,
    "comparisonTableMin" DECIMAL(6,2) NOT NULL DEFAULT 15,
    "revisionRoundMin" DECIMAL(6,2) NOT NULL DEFAULT 5,
    "approvalLoopMin" DECIMAL(6,2) NOT NULL DEFAULT 20,
    "poPrepMin" DECIMAL(6,2) NOT NULL DEFAULT 10,
    "hourlyLaborCost" DECIMAL(10,2),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "time_savings_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "time_savings_configs_companyId_key" ON "time_savings_configs"("companyId");
-- Tek global satır garantisi (companyId NULL olanlar arasında).
CREATE UNIQUE INDEX IF NOT EXISTS "time_savings_configs_global_singleton" ON "time_savings_configs"(("companyId" IS NULL)) WHERE "companyId" IS NULL;

ALTER TABLE "time_savings_configs" DROP CONSTRAINT IF EXISTS "time_savings_configs_companyId_fkey";
ALTER TABLE "time_savings_configs" ADD CONSTRAINT "time_savings_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
