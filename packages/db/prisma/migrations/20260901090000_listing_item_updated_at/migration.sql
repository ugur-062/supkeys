-- Perf turu (denetim P10): ilan detayı ETag/304 parmak izi için zaman damgası.
--
-- GÜVENLİK NOTU (docs/migration-safety.md): TAMAMEN EKLEMELİ, iki ADD COLUMN.
--   · Varsayılan `CURRENT_TIMESTAMP` PostgreSQL'de STABLE'dır ve PG11+ ADD
--     COLUMN'da bir kez değerlendirilip "missing value" olarak katalogda
--     saklanır → TABLO YENİDEN YAZILMAZ, kilit süresi satır sayısından
--     bağımsız sabittir.
--   · Veri kaybı yok; geri alma = iki DROP COLUMN.
--
-- Neden gerekli: `listing_items` hiç değişim damgası taşımıyordu. O olmadan ilan detayının parmak izi EKSİK kalırdı ve
-- kalem düzenlemesi "değişmedi" sayılıp istemciye
-- 304 dönerdi — ekran sessizce bayat kalırdı. Prisma `@updatedAt` değeri
-- uygulama katmanında yazar; buradaki varsayılan yalnız MEVCUT satırları
-- doldurur.

ALTER TABLE "listing_items"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- NOT: `listing_invitations` bilinçli olarak DIŞARIDA — o tablo değişmez
-- (yalnız oluşturulur/silinir, `status` gibi bir alanı yok), dolayısıyla
-- parmak izinde satır SAYISI tek başına yeterli.
