#!/bin/sh
# API konteyner başlangıcı: şema migrasyonu → (opsiyonel) seed → süreç.
# Prisma migrate deploy DIRECT_URL (yoksa DATABASE_URL) kullanır — Coolify env verir.
set -e

echo "[entrypoint] prisma migrate deploy..."
# ALLOW_REMOTE_MIGRATION=1 BURADA ZORUNLU ve DOĞRU.
#
# `migrate:deploy` bir nöbetçinin arkasında (assert-migration-target.ts):
# uzak bir veritabanına migration uygulamayı açık izin olmadan REDDEDER.
# O nöbetçinin amacı GELİŞTİRİCİ MAKİNESİNİ durdurmak — dev ve prod aynı
# Supabase'i kullandığı için oradaki her Prisma komutunun varsayılan hedefi
# canlı veritabanı.
#
# Ama BURASI geliştirici makinesi değil: bu, prod konteynerinin başlangıcı ve
# prod veritabanına migration uygulamak tam olarak yapılması GEREKEN iş.
# İzin bilinçli olarak ÇAĞRI YERİNDE veriliyor; Render env'ine kalıcı değişken
# olarak konmuyor ki nöbetçi geliştirici kabuğunda tam etkili kalsın.
#
# 2026-09-01: nöbetçi eklendiğinde bu satır güncellenmedi ve 17 saat boyunca
# HER deploy exit 1 ile düştü (set -e). Canlı, eski kodla çalışmaya devam
# ettiği için sessiz kaldı.
ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy

# İlk kurulumda admin tohumu: yalnız RUN_SEED=true iken. seed.ts prod'da zayıf
# INITIAL_ADMIN_PASSWORD'u reddeder (idempotent — tekrar çalışması güvenli).
if [ "${RUN_SEED}" = "true" ]; then
  echo "[entrypoint] seed (RUN_SEED=true)..."
  pnpm --filter @rothern/db seed
fi

echo "[entrypoint] starting API on :${API_PORT:-4000} ..."
# exec: PID 1 node olsun → SIGTERM doğrudan sürece ulaşsın (graceful shutdown).
exec node dist/main.js
