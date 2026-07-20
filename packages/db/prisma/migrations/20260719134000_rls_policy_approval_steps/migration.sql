-- INV-MT-5 Faz 5a — TRANSİTİF gerçek policy: approval step'leri (EXISTS parent).
--
-- approval_flow_steps + approval_request_steps: doğrudan companyId YOK; ebeveyn
-- (approval_flows/requests) companyId taşır ve ZATEN gerçek policy'li (2d-2a).
-- Intra-company (cross-tenant erişim YOK) → temiz transitif aday.
--
-- Policy: step ANCAK ebeveyni aktif tenant'a aitse görünür/yazılabilir. Subquery
-- ebeveynin "companyId"=current_setting ile eşleşmesini arar (ebeveyn RLS'i de
-- ayrıca filtreler → çift-güvence). Bağlam yoksa NULL → EXISTS false → boş.

ALTER TABLE "approval_flow_steps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approval_flow_steps_rls" ON "approval_flow_steps"
  USING (EXISTS (
    SELECT 1 FROM "approval_flows" f
    WHERE f."id" = "approval_flow_steps"."flowId"
      AND f."companyId" = current_setting('app.current_company_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "approval_flows" f
    WHERE f."id" = "approval_flow_steps"."flowId"
      AND f."companyId" = current_setting('app.current_company_id', true)
  ));

ALTER TABLE "approval_request_steps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approval_request_steps_rls" ON "approval_request_steps"
  USING (EXISTS (
    SELECT 1 FROM "approval_requests" r
    WHERE r."id" = "approval_request_steps"."requestId"
      AND r."companyId" = current_setting('app.current_company_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "approval_requests" r
    WHERE r."id" = "approval_request_steps"."requestId"
      AND r."companyId" = current_setting('app.current_company_id', true)
  ));
