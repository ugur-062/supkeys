-- A1: DISPUTED sipariş durumu — satıcı iptal talebini alıcı reddedince sipariş
-- ihtilaflı olur (ACCEPTED'a geri dönmez). Saat durur, iki-yönlü çıkış açık.
-- Yalnız enum değeri ekler; bu değeri KULLANAN DML ayrı migration'dadır (rule).

ALTER TYPE "CompanyOrderStatus" ADD VALUE IF NOT EXISTS 'DISPUTED' AFTER 'CANCELLED';
