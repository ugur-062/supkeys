-- Faz AI-3 — asistan oturumunda biriken ihale taslağı (belge + konuşma birleşimi).
-- Additive nullable kolon: veri kaybı / kilit riski yok.
ALTER TABLE "ai_chat_sessions" ADD COLUMN "tenderDraft" JSONB;
