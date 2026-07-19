-- INV-MT-5 Faz 2a — Kısıtlı runtime rolü (RLS backstop).
--
-- `rothern_app`: RLS'e TABİ olan non-owner rol (NOSUPERUSER, NOBYPASSRLS).
-- Prod runtime bununla bağlanır → policy'ler ETKİLİ. Migration/seed/bypass-client
-- owner (postgres) ile devam → RLS'i bypass eder (owner FORCE olmadan bypass'lar).
-- Bu migration policy EKLEMEZ (Faz 2b/2d); yalnız rol + grant altyapısı.
--
-- PAROLA YOK (git'e sır girmez): env-özel `ALTER ROLE rothern_app PASSWORD …`
-- ile verilir (test harness: bilinen test parolası; prod: Supabase secret).
--
-- ⚠️ PROD-OPS (Faz 2 sonu, AYRI adım): Supabase'de CREATE ROLE süper-yetki ister;
-- bu migration lokalde geçse de prod-Supabase'de aynen çalışacağı GARANTİ DEĞİL
-- (Supabase rol modeli farklı olabilir → dashboard/SQL editor veya farklı grant).
-- Prod'a uygulamadan ÖNCE Supabase'de doğrulanacak. bkz. docs/rls-plan.md.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    CREATE ROLE rothern_app WITH
      LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

-- Grant'ler current_schema()'ye (lokal `rothern_test` / prod `public` — AYNI SQL).
DO $$
DECLARE s text := current_schema();
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO rothern_app', s);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO rothern_app',
    s);
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO rothern_app', s);
  -- Gelecekteki migration'ların yarattığı tablo/sequence'ler de otomatik grant'li.
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rothern_app',
    s);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO rothern_app',
    s);
END $$;
