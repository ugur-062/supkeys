-- Admin gecici parola zorunlu degisimi (arayuz testi D-025). EKLEMELI.
-- Personel ekle / sifre sifirla ile verilen gecici parola suresiz ve tek
-- basina tam panel erisimi veriyordu. Bayrak true iken AdminRolesGuard yalniz
-- me + change-password + 2FA kurulum uclarini acar; change-password false yapar.
--
-- NOT NULL DEFAULT false -> PG 11+ sabit default'ta tablo yeniden yazilmaz.
-- Backfill YOK: mevcut personelin parolasi gecici mi bilinmiyor; mevcut
-- hesaplar kilitlenmez (yalniz bundan sonra verilen gecici parolalar).

-- AlterTable
ALTER TABLE "platform_admins" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
