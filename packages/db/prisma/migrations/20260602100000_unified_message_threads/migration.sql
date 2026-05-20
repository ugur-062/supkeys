-- V2-4.2 — Unified message threads per (tenant, supplier).
-- Mesajlaşma "context" (TENDER/ORDER/DIRECT) artık thread seviyesinde değil,
-- mesaj seviyesinde bir tag. Bir tenant ↔ supplier çifti için tek thread,
-- kronolojik akış + her balonda context chip.

-- ============================================================================
-- 1) messages tablosuna context + contextRefId ekle (nullable, geçici)
-- ============================================================================
ALTER TABLE "messages" ADD COLUMN "context" "MessageContext";
ALTER TABLE "messages" ADD COLUMN "contextRefId" TEXT;

-- ============================================================================
-- 2) Mevcut mesajlara parent thread'in context bilgisini kopyala
-- ============================================================================
UPDATE "messages" m
SET
  "context" = t."context",
  "contextRefId" = CASE
    -- DIRECT context için contextRefId mesaj seviyesinde anlam taşımaz (null)
    WHEN t."context" = 'DIRECT' THEN NULL
    ELSE t."contextRefId"
  END
FROM "message_threads" t
WHERE m."threadId" = t.id;

-- ============================================================================
-- 3) Duplicate thread'leri merge: (tenantId, supplierId) çifti başına en eski
-- thread'i tut, diğer thread'lerin mesajlarını ona aktar, eskileri sil.
-- ============================================================================
WITH keepers AS (
  SELECT DISTINCT ON ("tenantId", "supplierId")
    id,
    "tenantId",
    "supplierId"
  FROM "message_threads"
  ORDER BY "tenantId", "supplierId", "createdAt" ASC, id ASC
)
UPDATE "messages" m
SET "threadId" = k.id
FROM "message_threads" t
JOIN keepers k
  ON k."tenantId" = t."tenantId" AND k."supplierId" = t."supplierId"
WHERE m."threadId" = t.id
  AND t.id <> k.id;

-- Eski (loser) thread'leri sil
DELETE FROM "message_threads" t
USING (
  SELECT DISTINCT ON ("tenantId", "supplierId")
    id,
    "tenantId",
    "supplierId"
  FROM "message_threads"
  ORDER BY "tenantId", "supplierId", "createdAt" ASC, id ASC
) k
WHERE t."tenantId" = k."tenantId"
  AND t."supplierId" = k."supplierId"
  AND t.id <> k.id;

-- ============================================================================
-- 4) Kalan thread'lerin lastMessageAt + lastMessagePreview alanlarını
-- merge sonrası en yeni mesaja göre yeniden hesapla
-- ============================================================================
UPDATE "message_threads" t
SET
  "lastMessageAt" = sub."maxSentAt",
  "lastMessagePreview" = LEFT(sub.content, 200)
FROM (
  SELECT DISTINCT ON ("threadId")
    "threadId",
    MAX("sentAt") OVER (PARTITION BY "threadId") AS "maxSentAt",
    content
  FROM "messages"
  ORDER BY "threadId", "sentAt" DESC
) sub
WHERE t.id = sub."threadId";

-- ============================================================================
-- 5) Eski unique index'i drop et, yeni (tenantId, supplierId) unique ekle
-- ============================================================================
DROP INDEX IF EXISTS "message_threads_context_contextRefId_tenantId_supplierId_key";
DROP INDEX IF EXISTS "message_threads_context_contextRefId_idx";

CREATE UNIQUE INDEX "message_threads_tenantId_supplierId_key"
  ON "message_threads"("tenantId", "supplierId");

-- ============================================================================
-- 6) message_threads tablosundan context/contextRefId kolonlarını drop et
-- ============================================================================
ALTER TABLE "message_threads" DROP COLUMN "context";
ALTER TABLE "message_threads" DROP COLUMN "contextRefId";

-- ============================================================================
-- 7) messages.context için index ekle (filter sorguları için)
-- ============================================================================
CREATE INDEX "messages_context_contextRefId_idx"
  ON "messages"("context", "contextRefId");
