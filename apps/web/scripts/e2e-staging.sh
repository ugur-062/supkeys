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
export E2E_EMAIL="${E2E_EMAIL:-uguray156+qa-alici-kurucu@gmail.com}"
export E2E_PASSWORD="${E2E_PASSWORD:-${STAGING_QA_PASSWORD:-Staging1234!}}"
exec npx playwright test --reporter=line "$@"
