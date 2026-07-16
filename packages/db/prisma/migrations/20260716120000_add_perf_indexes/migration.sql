-- Perf indexes (1000-firma hedefi) — denetim Tier-1/Tier-2 bulguları.
-- Yazma-maliyeti disiplini: mümkün olan yerde YENİ index yerine mevcut FK-index
-- GENİŞLETİLDİ (prefix eski kullanımı karşılar) → net yeni index minimum.
-- Tablolar bugün küçük/boş (prod henüz açılmadı) → düz CREATE INDEX güvenli
-- (kilit yok). Prod zaten büyük olsaydı hot tablolarda CONCURRENTLY gerekirdi.

-- Widen: FK-index'leri filtre/sort kolonuyla genişlet (eski tekli index düşer).
DROP INDEX "company_orders_buyerCompanyId_idx";
DROP INDEX "company_orders_sellerCompanyId_idx";
DROP INDEX "listing_bids_bidderCompanyId_idx";
DROP INDEX "listings_companyId_type_idx";
DROP INDEX "listings_status_idx";
DROP INDEX "message_threads_buyerCompanyId_idx";
DROP INDEX "message_threads_sellerCompanyId_idx";

-- New: cron global-scan + admin liste/KYC.
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "companies_companyVerificationStatus_idx" ON "companies"("companyVerificationStatus");
CREATE INDEX "company_orders_status_idx" ON "company_orders"("status");

-- Widened composites.
CREATE INDEX "company_orders_sellerCompanyId_status_idx" ON "company_orders"("sellerCompanyId", "status");
CREATE INDEX "company_orders_buyerCompanyId_status_idx" ON "company_orders"("buyerCompanyId", "status");
CREATE INDEX "listing_bids_bidderCompanyId_status_idx" ON "listing_bids"("bidderCompanyId", "status");
CREATE INDEX "listings_status_closesAt_idx" ON "listings"("status", "closesAt");
CREATE INDEX "listings_companyId_type_status_idx" ON "listings"("companyId", "type", "status");
CREATE INDEX "message_threads_buyerCompanyId_lastMessageAt_idx" ON "message_threads"("buyerCompanyId", "lastMessageAt");
CREATE INDEX "message_threads_sellerCompanyId_lastMessageAt_idx" ON "message_threads"("sellerCompanyId", "lastMessageAt");
