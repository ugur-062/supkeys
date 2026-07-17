-- TTK 23 ayıp ihbarı alanları (order üzerinde; ayrı tablo yok — kanıt izi
-- audit_logs'ta). defectNotifiedAt varlığı ayıp-DISPUTED'ı A1 (satıcı iptal
-- talebi) DISPUTED'ından ayırır; disputePrevStatus geri çekmede önceki duruma
-- (DELIVERED/COMPLETED) döndürür. DISPUTED enum değeri A1'de eklendi; burada
-- disputePrevStatus MEVCUT CompanyOrderStatus tipini kullanır (yeni değer YOK).

ALTER TABLE "company_orders"
  ADD COLUMN "defectNotifiedAt"  TIMESTAMP(3),
  ADD COLUMN "defectReason"      TEXT,
  ADD COLUMN "disputePrevStatus" "CompanyOrderStatus";
