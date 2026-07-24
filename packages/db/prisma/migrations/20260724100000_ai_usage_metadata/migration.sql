-- Faz AI-1 — AiUsage.metadata (route/sayfa sayısı gibi özellik bağlamı;
-- ölçüm/kalibrasyon). Additive nullable kolon: veri kaybı / kilit riski yok.
ALTER TABLE "ai_usage" ADD COLUMN "metadata" JSONB;
