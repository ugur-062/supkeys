-- Davet basina "davet bildirimi gonderildi" damgasi (arayuz testi FX-00 D-177).
-- EKLEMELI. Acilis duyurusu ile elle davet ayni davetliye iki e-posta
-- atiyordu; iki yol da gondermeden once bu kolonu kosullu damgalar
-- (UPDATE ... WHERE "notifiedAt" IS NULL RETURNING), yalniz damgayi alan
-- gonderir. NULL = henuz duyurulmamis ya da eski satir (eski satirlar acilis
-- duyurusu claim'i zaten alindigi icin yeniden duyurulmaz). Nullable, default
-- yok -> tablo yeniden yazilmaz, kilit kisa.

-- AlterTable
ALTER TABLE "listing_invitations" ADD COLUMN "notifiedAt" TIMESTAMP(3);
