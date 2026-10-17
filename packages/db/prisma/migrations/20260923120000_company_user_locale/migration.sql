-- ARAYÜZ DİLİ — i18n Faz 0 (docs/plan-i18n.md).
--
-- Tümüyle EKLEMELİ ve güvenli (docs/migration-safety.md "güvenli desenler"):
-- NOT NULL + sabit DEFAULT (PG11+ metadata-only, tablo yeniden yazımı ve kilit
-- yok), index yok, tip değişimi yok. Eski API sürümü kolonu okumaz; yeni API
-- eski satırlarda 'tr' görür. RLS politikaları kolon eklemesinden etkilenmez;
-- tablo düzeyi GRANT yeni kolonu kapsar.
ALTER TABLE "company_users"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'tr';
