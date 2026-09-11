#!/usr/bin/env bash
# Staging'e karşı Playwright (2026-09-11). Sırlar repo kökündeki gitignore'lu
# .env.staging'den: STAGING_VERCEL_BYPASS_WEB (Vercel Deployment Protection
# bypass) — çerez de yazdırılır. Hesap: QA alıcı kurucu (seed-staging-roles).
#   pnpm --filter @rothern/web e2e:staging            # hepsi
#   pnpm --filter @rothern/web e2e:staging e2e/x.spec.ts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
set -a; . "$ROOT/.env.staging"; set +a
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://staging.rothern.com}"
export PLAYWRIGHT_VERCEL_BYPASS="${STAGING_VERCEL_BYPASS_WEB:?.env.staging: STAGING_VERCEL_BYPASS_WEB yok}"
export PLAYWRIGHT_VERCEL_BYPASS_ADMIN="${STAGING_VERCEL_BYPASS_ADMIN:-}"
# Admin parolası Render ortam dosyasından (gitignore'lu) — yoksa admin adımları atlanır.
if [ -z "${E2E_ADMIN_PASSWORD:-}" ] && [ -f "$ROOT/render.staging.env" ]; then
  export E2E_ADMIN_PASSWORD="$(grep -E "^INITIAL_ADMIN_PASSWORD=" "$ROOT/render.staging.env" | head -1 | cut -d= -f2-)"
fi
# Kayıt turu doğrulama kodunu ve temizliği VERİTABANINDAN yapar (posta
# kutusuna bağımlı test kırılgan olur) — staging bağlantısı testlere geçer.
export E2E_DATABASE_URL="${STAGING_DATABASE_URL:-}"
export E2E_SUPABASE_URL="${STAGING_SUPABASE_URL:-}"
export E2E_SUPABASE_SERVICE_KEY="${STAGING_SUPABASE_SERVICE_ROLE_KEY:-}"
export E2E_EMAIL="${E2E_EMAIL:-uguray156+qa-alici-kurucu@gmail.com}"
export E2E_PASSWORD="${E2E_PASSWORD:-${STAGING_QA_PASSWORD:-Staging1234!}}"
exec npx playwright test --reporter=line "$@"
