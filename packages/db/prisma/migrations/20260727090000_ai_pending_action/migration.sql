-- Faz AI-4 — asistan onay-bekleyen aksiyon kaydı (oturum başına tek).
-- Model asla doğrudan yazamaz: propose → bu kolona kayıt + UI onay kartı →
-- kullanıcı confirm endpoint'iyle (CSRF'li) yürütür. Ek kolon, rewrite yok.
ALTER TABLE "ai_chat_sessions" ADD COLUMN "pendingAction" JSONB;
