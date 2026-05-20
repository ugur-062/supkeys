-- Supabase Auth source-of-truth → bcrypt passwordHash artık zorunlu değil.
-- Legacy/transitional kayıtlar için nullable; V2'de DROP edilecek.
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "platform_admins" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "supplier_users" ALTER COLUMN "passwordHash" DROP NOT NULL;
