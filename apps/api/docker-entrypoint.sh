#!/bin/sh
# API konteyner başlangıcı: şema migrasyonu → (opsiyonel) seed → süreç.
# Prisma migrate deploy DIRECT_URL (yoksa DATABASE_URL) kullanır — Coolify env verir.
set -e

echo "[entrypoint] prisma migrate deploy..."
pnpm --filter @supkeys/db migrate:deploy

# İlk kurulumda admin tohumu: yalnız RUN_SEED=true iken. seed.ts prod'da zayıf
# INITIAL_ADMIN_PASSWORD'u reddeder (idempotent — tekrar çalışması güvenli).
if [ "${RUN_SEED}" = "true" ]; then
  echo "[entrypoint] seed (RUN_SEED=true)..."
  pnpm --filter @supkeys/db seed
fi

echo "[entrypoint] starting API on :${API_PORT:-4000} ..."
# exec: PID 1 node olsun → SIGTERM doğrudan sürece ulaşsın (graceful shutdown).
exec node dist/main.js
