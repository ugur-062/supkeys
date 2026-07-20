-- INV-MT-5 Faz 6c — İKİ-TARAFLI gerçek policy: message threads + messages.
--
-- message_threads: buyer + seller (iki taraf da okur/yazar) → `current IN (a,b)`.
-- messages: doğrudan iki-taraf yok (senderCompanyId + threadId); görünürlük
--   EBEVEYN thread'in taraflarına bağlı → EXISTS parent (thread'in buyer/seller'ı
--   current ile eşleşir). Böylece gönderen VE alan taraf mesajı görür.
-- Tüm erişim company-messages domain servisi (bağlam-içi, aktör bir taraf); cross-
--   tenant/directory/admin okuma YOK. Bağlam yoksa NULL → boş (fail-closed).

ALTER TABLE "message_threads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_threads_rls" ON "message_threads"
  USING (current_setting('app.current_company_id', true)
         IN ("buyerCompanyId", "sellerCompanyId"))
  WITH CHECK (current_setting('app.current_company_id', true)
         IN ("buyerCompanyId", "sellerCompanyId"));

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_rls" ON "messages"
  USING (EXISTS (
    SELECT 1 FROM "message_threads" t
    WHERE t."id" = "messages"."threadId"
      AND current_setting('app.current_company_id', true)
          IN (t."buyerCompanyId", t."sellerCompanyId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "message_threads" t
    WHERE t."id" = "messages"."threadId"
      AND current_setting('app.current_company_id', true)
          IN (t."buyerCompanyId", t."sellerCompanyId")
  ));
