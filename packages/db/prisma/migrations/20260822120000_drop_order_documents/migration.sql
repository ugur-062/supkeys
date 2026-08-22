-- Sipariş belgeleri KALDIRILDI (2026-08-22): platform muhasebe/belge arşivi değil —
-- teminat/irsaliye/dekont/fatura/LC belgeleri firmaların kendi kanallarında
-- (e-fatura, banka, ERP) yaşar. Ödeme alındı/alınmadı takibi + IBAN snapshot KALIR.
--
-- YIKICI (docs/migration-safety.md): tablo + enum kalıcı silinir. Silme anında
-- (dev/prod paylaşımlı DB) 6 demo satırı vardı (4 TEMINAT, 2 PAYMENT) — iş
-- açısından kayıp KABUL EDİLDİ. Prod `migrate deploy` ÖNCESİ snapshot al (kural).
-- R2'deki `company-orders/<orderId>/...` nesneleri yetim kalır (zararsız).
-- RLS policy "company_order_documents_rls" tabloyla birlikte düşer.

DROP TABLE IF EXISTS "company_order_documents";
DROP TYPE IF EXISTS "CompanyDocType";
