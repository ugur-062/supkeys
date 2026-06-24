-- Madde 29 — alıcı (User) e-posta kod doğrulaması.
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
-- Mevcut kullanıcılar doğrulanmış say (login engellenmesin).
UPDATE "users" SET "emailVerifiedAt" = "createdAt";
