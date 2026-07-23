-- Faz AI-0 — AI kullanım sayacı (append-only; AuditLog deseni).
-- Bakiye TÜRETİLİR: SUM(costUsd) — stored bakiye kolonu YOK (X7-drift önlemi).
-- costUsd yazım anında fiyat-snapshot'ı. RLS policy BİLİNÇLİ yok (INV-MT-5
-- backstop listesine eklendi; reaper cron bypass gerektirirdi).
-- Salt yeni tablo: veri kaybı / kilit / downtime riski yok (migration-safety.md).

-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('RESERVED', 'SETTLED', 'FAILED');

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_companyId_createdAt_idx" ON "ai_usage"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_companyId_userId_createdAt_idx" ON "ai_usage"("companyId", "userId", "createdAt");

-- CreateIndex (reaper: eski RESERVED taraması)
CREATE INDEX "ai_usage_status_createdAt_idx" ON "ai_usage"("status", "createdAt");
