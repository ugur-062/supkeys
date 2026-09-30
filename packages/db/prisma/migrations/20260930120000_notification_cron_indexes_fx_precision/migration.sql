-- Derin denetim LU-09 (DÜŞÜK): bildirim cron index'leri + çevrim damgası ölçeği.
--
-- GÜVENLİK NOTU (docs/migration-safety.md): bu migration EKLEMELİ / GENİŞLETİCİ.
--   · İki CREATE INDEX (`notifications`): yayın öncesi tablo küçük → düz
--     CREATE INDEX'in kısa kilidi kabul edilebilir. CONCURRENTLY kullanılmadı
--     çünkü Prisma migration'ları transaction içinde koşar. Sorgular:
--     email-programs (yaşam döngüsü: companyId+type+createdAt; sıfır teklif
--     hatırlatması: type+listingId, 15 dk'da bir) ve AI bütçe uyarısı
--     (companyId+type+createdAt) — bu index'ler yokken sıralı tarama yapıyordu.
--   · `listing_bid_items.fxToBase` DECIMAL(18,6) → DECIMAL(24,12): tam sayı
--     basamağı aynı (12), ölçek büyür → mevcut her değer kayıpsız sığar
--     (taşma/yuvarlama yok). Ölçek değişimi tabloyu yeniden yazar; yayın
--     öncesi tablo küçük. Sebep: KRW gibi zayıf birimden EUR/KWD'ye damga
--     ~0,0006 düzeyinde kalıyor, 6 ondalık yuvarlama teklif toplamında göreli
--     %0,1-0,2 sapma yaratıyordu. Mevcut damgalar olduğu gibi kalır (bid.amount
--     o damgayla hesaplandı; S5 nöbetçisi aynı damgayla yeniden hesaplar).
--   · Veri kaybı YOK. Geri alma = iki DROP INDEX (+ istenirse tip geri alımı;
--     12 ondalıklı yeni damgalar 6'ya yuvarlanır, bu yüzden önerilmez).

-- AlterTable
ALTER TABLE "listing_bid_items" ALTER COLUMN "fxToBase" SET DATA TYPE DECIMAL(24,12);

-- CreateIndex
CREATE INDEX "notifications_companyId_type_createdAt_idx" ON "notifications"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_listingId_type_idx" ON "notifications"("listingId", "type");
