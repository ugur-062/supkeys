-- E.7.C — Approval Flow konfigürasyonu (CRUD-only; runtime E.7.D'de)
-- Manuel uygulanır (proje pattern'ı).

-- 1) Enum'lar
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalFlowType') THEN
    CREATE TYPE "ApprovalFlowType" AS ENUM ('TENDER_PUBLISH', 'TENDER_AWARD');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalFlowStatus') THEN
    CREATE TYPE "ApprovalFlowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PASSIVE');
  END IF;
END $$;

-- 2) ApprovalFlow tablosu
CREATE TABLE IF NOT EXISTS "approval_flows" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "flowNumber"  INTEGER NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "type"        "ApprovalFlowType" NOT NULL,
  "status"      "ApprovalFlowStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_flows_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_flows_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_flows_tenantId_flowNumber_key"
  ON "approval_flows"("tenantId", "flowNumber");
CREATE INDEX IF NOT EXISTS "approval_flows_tenantId_type_status_idx"
  ON "approval_flows"("tenantId", "type", "status");
CREATE INDEX IF NOT EXISTS "approval_flows_tenantId_status_idx"
  ON "approval_flows"("tenantId", "status");

-- 3) ApprovalFlowInitiator (M2M between User and ApprovalFlow)
CREATE TABLE IF NOT EXISTS "approval_flow_initiators" (
  "id"        TEXT PRIMARY KEY,
  "flowId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_flow_initiators_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "approval_flows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_flow_initiators_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_flow_initiators_flowId_userId_key"
  ON "approval_flow_initiators"("flowId", "userId");
CREATE INDEX IF NOT EXISTS "approval_flow_initiators_userId_idx"
  ON "approval_flow_initiators"("userId");

-- 4) ApprovalFlowStep
CREATE TABLE IF NOT EXISTS "approval_flow_steps" (
  "id"                  TEXT PRIMARY KEY,
  "flowId"              TEXT NOT NULL,
  "orderIndex"          INTEGER NOT NULL,
  "approverUserId"      TEXT NOT NULL,
  "conditionMinAmount"  DECIMAL(20, 2),
  "conditionCurrency"   TEXT DEFAULT 'TRY',
  "displayLabel"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_flow_steps_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "approval_flows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_flow_steps_approverUserId_fkey"
    FOREIGN KEY ("approverUserId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_flow_steps_flowId_orderIndex_key"
  ON "approval_flow_steps"("flowId", "orderIndex");
CREATE INDEX IF NOT EXISTS "approval_flow_steps_approverUserId_idx"
  ON "approval_flow_steps"("approverUserId");
