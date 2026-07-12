-- Değerlendirme uzarken "teklif geçerlilikleri doluyor" sahip hatırlatması (idempotency).
ALTER TABLE "listings" ADD COLUMN "evaluationReminderSentAt" TIMESTAMP(3);
