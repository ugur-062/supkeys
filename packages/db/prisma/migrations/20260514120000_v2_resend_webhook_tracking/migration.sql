-- V2-1 — Resend webhook delivery tracking.
-- Manuel uygulanır.

-- 1) EmailStatus enum'una 5 yeni status (DELIVERED/OPENED/CLICKED/BOUNCED/COMPLAINED)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DELIVERED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EmailStatus')) THEN
    ALTER TYPE "EmailStatus" ADD VALUE 'DELIVERED' BEFORE 'FAILED';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'OPENED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EmailStatus')) THEN
    ALTER TYPE "EmailStatus" ADD VALUE 'OPENED' BEFORE 'FAILED';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CLICKED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EmailStatus')) THEN
    ALTER TYPE "EmailStatus" ADD VALUE 'CLICKED' BEFORE 'FAILED';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BOUNCED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EmailStatus')) THEN
    ALTER TYPE "EmailStatus" ADD VALUE 'BOUNCED' BEFORE 'FAILED';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPLAINED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EmailStatus')) THEN
    ALTER TYPE "EmailStatus" ADD VALUE 'COMPLAINED' BEFORE 'FAILED';
  END IF;
END $$;

-- 2) EmailEventType enum (yeni)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailEventType') THEN
    CREATE TYPE "EmailEventType" AS ENUM (
      'SENT', 'DELIVERED', 'DELIVERY_DELAYED',
      'BOUNCED', 'COMPLAINED', 'OPENED', 'CLICKED', 'FAILED'
    );
  END IF;
END $$;

-- 3) email_logs tablosuna delivery alanları
ALTER TABLE "email_logs"
  ADD COLUMN IF NOT EXISTS "deliveredAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "openedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clickedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bouncedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bounceType"   TEXT,
  ADD COLUMN IF NOT EXISTS "bounceReason" TEXT,
  ADD COLUMN IF NOT EXISTS "complainedAt" TIMESTAMP(3);

-- 4) providerMessageId UNIQUE (webhook lookup için).
-- Mevcut ortamda NULL'lar olabilir; partial unique index daha güvenli.
CREATE UNIQUE INDEX IF NOT EXISTS "email_logs_providerMessageId_key"
  ON "email_logs" ("providerMessageId")
  WHERE "providerMessageId" IS NOT NULL;

-- 5) email_events tablosu
CREATE TABLE IF NOT EXISTS "email_events" (
  "id"           TEXT PRIMARY KEY,
  "emailLogId"   TEXT NOT NULL,
  "eventId"      TEXT NOT NULL UNIQUE,
  "eventType"    "EmailEventType" NOT NULL,
  "occurredAt"   TIMESTAMP(3) NOT NULL,
  "payload"      JSONB NOT NULL,
  "clickedUrl"   TEXT,
  "bounceType"   TEXT,
  "bounceReason" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_events_emailLogId_fkey"
    FOREIGN KEY ("emailLogId") REFERENCES "email_logs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "email_events_emailLogId_occurredAt_idx"
  ON "email_events" ("emailLogId", "occurredAt");
CREATE INDEX IF NOT EXISTS "email_events_eventType_idx"
  ON "email_events" ("eventType");
