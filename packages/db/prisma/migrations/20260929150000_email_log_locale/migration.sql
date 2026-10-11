-- E-posta gonderim dili (derin denetim 2026-09-29 MU-05). EKLEMELI.
-- Admin "Yeniden gonder" orijinal alicinin dilini kullansin diye EmailLog'a
-- yazilir. NULL = eski satir (Turkce varsayilir). Nullable, default yok ->
-- tablo yeniden yazilmaz, kilit kisa.

-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN "locale" TEXT;
