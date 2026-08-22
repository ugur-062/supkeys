-- Değerlendiren firma adı görünürlüğü (opt-in). Ekleme-only, default false:
-- mevcut değerlendirmeler anonim ("Doğrulanmış alıcı/tedarikçi") kalır.
ALTER TABLE "company_reviews" ADD COLUMN "showName" BOOLEAN NOT NULL DEFAULT false;
