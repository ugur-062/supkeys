-- E.7.D — Approval Request runtime
-- Manuel uygulanır (proje pattern'ı).

-- 1) TenderStatus enum'una IN_APPROVAL + IN_AWARD_APPROVAL ekle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'IN_APPROVAL'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TenderStatus')
  ) THEN
    ALTER TYPE "TenderStatus" ADD VALUE 'IN_APPROVAL' BEFORE 'OPEN_FOR_BIDS';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'IN_AWARD_APPROVAL'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TenderStatus')
  ) THEN
    ALTER TYPE "TenderStatus" ADD VALUE 'IN_AWARD_APPROVAL' BEFORE 'AWARDED';
  END IF;
END $$;

-- 2) Yeni enum'lar
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalRequestStatus') THEN
    CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStepStatus') THEN
    CREATE TYPE "ApprovalStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');
  END IF;
END $$;

-- 3) approval_requests tablosu
CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id"             TEXT PRIMARY KEY,
  "approvalNumber" TEXT NOT NULL UNIQUE,
  "tenantId"       TEXT NOT NULL,
  "flowId"         TEXT NOT NULL,
  "type"           "ApprovalFlowType" NOT NULL,
  "tenderId"       TEXT NOT NULL,
  "status"         "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "amount"         DECIMAL(20, 2) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'TRY',
  "initiatedById"  TEXT NOT NULL,
  "initiatorNote"  TEXT,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_requests_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_requests_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "approval_flows"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approval_requests_tenderId_fkey"
    FOREIGN KEY ("tenderId") REFERENCES "tenders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_requests_initiatedById_fkey"
    FOREIGN KEY ("initiatedById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "approval_requests_tenantId_status_type_idx"
  ON "approval_requests"("tenantId", "status", "type");
CREATE INDEX IF NOT EXISTS "approval_requests_tenantId_status_idx"
  ON "approval_requests"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "approval_requests_tenderId_idx"
  ON "approval_requests"("tenderId");
CREATE INDEX IF NOT EXISTS "approval_requests_initiatedById_status_idx"
  ON "approval_requests"("initiatedById", "status");

-- 4) approval_request_steps tablosu
CREATE TABLE IF NOT EXISTS "approval_request_steps" (
  "id"                 TEXT PRIMARY KEY,
  "requestId"          TEXT NOT NULL,
  "flowStepId"         TEXT NOT NULL,
  "approverUserId"     TEXT NOT NULL,
  "status"             "ApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
  "orderIndex"         INTEGER NOT NULL,
  "conditionMinAmount" DECIMAL(20, 2),
  "displayLabel"       TEXT,
  "decidedAt"          TIMESTAMP(3),
  "decisionNote"       TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_request_steps_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_request_steps_flowStepId_fkey"
    FOREIGN KEY ("flowStepId") REFERENCES "approval_flow_steps"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approval_request_steps_approverUserId_fkey"
    FOREIGN KEY ("approverUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "approval_request_steps_approverUserId_status_idx"
  ON "approval_request_steps"("approverUserId", "status");
CREATE INDEX IF NOT EXISTS "approval_request_steps_requestId_orderIndex_idx"
  ON "approval_request_steps"("requestId", "orderIndex");
