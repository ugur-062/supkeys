-- Çift yönlü değerlendirme: sipariş başına taraf-başına tek review.
-- orderId tekil unique kaldırılır, (orderId, reviewerCompanyId) composite unique eklenir.
-- DropIndex
DROP INDEX "company_reviews_orderId_key";

-- CreateIndex
CREATE UNIQUE INDEX "company_reviews_orderId_reviewerCompanyId_key" ON "company_reviews"("orderId", "reviewerCompanyId");
