-- V2-7+ — Kalem başına çoklu + tipli soru ve tedarikçi cevapları (JSON).
-- TenderItem.questions: [{ id, text, answerType, required }]
-- BidItem.answers:      [{ questionId, value }]
-- Legacy customQuestion/customAnswer korunur (okuma katmanı fallback yapar).

ALTER TABLE "tender_items" ADD COLUMN "questions" JSONB;
ALTER TABLE "bid_items" ADD COLUMN "answers" JSONB;
