-- Lojistik İhalesi — RFQ üstüne yapılandırılmış lojistik bilgi katmanı.
ALTER TABLE "tenders" ADD COLUMN "isLogistics" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenders" ADD COLUMN "logisticsDetails" JSONB;
