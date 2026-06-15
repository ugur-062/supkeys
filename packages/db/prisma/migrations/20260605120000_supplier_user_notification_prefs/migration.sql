-- Ayarlar — tedarikçi kullanıcısı e-posta bildirim tercihleri (key: boolean JSON).
-- null = tüm varsayılan açık (opt-in).
ALTER TABLE "supplier_users" ADD COLUMN "notificationPrefs" JSONB;
