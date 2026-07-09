-- H2: CompanyConnection yön-bağımsız tekillik. Mevcut @@unique(inviter,invitee)
-- YÖNLÜ olduğundan A→B ve B→A iki ayrı PENDING/ACTIVE satır olabiliyordu
-- (eşzamanlı karşılıklı istek → çift bağlantı). Sırasız-çift (unordered pair)
-- üzerinde partial unique index bunu DB-seviyesinde engeller; geçmiş REJECTED
-- kayıtlar etkilenmez. (Fonksiyonel index Prisma şemasında ifade edilemez →
-- yalnız migration; test şeması db push'ta bu index olmaz, app-katmanı korur.)
CREATE UNIQUE INDEX "company_connections_unordered_active_key"
  ON "company_connections" (
    LEAST("inviterCompanyId", "inviteeCompanyId"),
    GREATEST("inviterCompanyId", "inviteeCompanyId")
  )
  WHERE status IN ('PENDING', 'ACTIVE');
