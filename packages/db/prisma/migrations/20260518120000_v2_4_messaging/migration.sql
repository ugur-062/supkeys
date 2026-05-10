-- V2-4 — 1-on-1 mesajlaşma (ORDER + TENDER context).
-- Polymorphic thread; tedarikçiler birbirini görmez.

-- 1) AttachmentScope enum'a MESSAGE_ATTACHMENT ekle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'MESSAGE_ATTACHMENT'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AttachmentScope')
  ) THEN
    ALTER TYPE "AttachmentScope" ADD VALUE 'MESSAGE_ATTACHMENT';
  END IF;
END $$;

-- 2) MessageContext enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageContext') THEN
    CREATE TYPE "MessageContext" AS ENUM ('ORDER', 'TENDER');
  END IF;
END $$;

-- 3) MessageSenderType enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageSenderType') THEN
    CREATE TYPE "MessageSenderType" AS ENUM ('TENANT_USER', 'SUPPLIER_USER');
  END IF;
END $$;

-- 4) message_threads tablosu
CREATE TABLE IF NOT EXISTS "message_threads" (
  "id"                 TEXT NOT NULL,
  "context"            "MessageContext" NOT NULL,
  "contextRefId"       TEXT NOT NULL,
  "tenantId"           TEXT NOT NULL,
  "supplierId"         TEXT NOT NULL,
  "lastMessageAt"      TIMESTAMP(3),
  "tenantLastReadAt"   TIMESTAMP(3),
  "supplierLastReadAt" TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_threads_context_contextRefId_tenantId_supplierId_key"
  ON "message_threads"("context", "contextRefId", "tenantId", "supplierId");
CREATE INDEX IF NOT EXISTS "message_threads_tenantId_lastMessageAt_idx"
  ON "message_threads"("tenantId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "message_threads_supplierId_lastMessageAt_idx"
  ON "message_threads"("supplierId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "message_threads_context_contextRefId_idx"
  ON "message_threads"("context", "contextRefId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_threads_tenantId_fkey'
  ) THEN
    ALTER TABLE "message_threads"
      ADD CONSTRAINT "message_threads_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_threads_supplierId_fkey'
  ) THEN
    ALTER TABLE "message_threads"
      ADD CONSTRAINT "message_threads_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5) messages tablosu
CREATE TABLE IF NOT EXISTS "messages" (
  "id"                   TEXT NOT NULL,
  "threadId"             TEXT NOT NULL,
  "senderType"           "MessageSenderType" NOT NULL,
  "senderUserId"         TEXT,
  "senderSupplierUserId" TEXT,
  "content"              TEXT NOT NULL,
  "attachmentIds"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "emailNotifiedAt"      TIMESTAMP(3),
  "sentAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "messages_threadId_sentAt_idx"
  ON "messages"("threadId", "sentAt");
CREATE INDEX IF NOT EXISTS "messages_emailNotifiedAt_sentAt_idx"
  ON "messages"("emailNotifiedAt", "sentAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_threadId_fkey'
  ) THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "message_threads"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
