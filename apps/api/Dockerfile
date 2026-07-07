# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Supkeys API (NestJS) — Coolify/Hetzner imajı.
# Yan servisler managed (Supabase/Resend/R2) → bu imaj yalnız API sürecidir.
#
# NOT (Node sürümü): @supkeys/db `main: src/index.ts` (ham TS) olarak dışa açılır;
# derlenmiş API çalışırken `require("@supkeys/db")` yapar. Node ≥22.18 `require`
# içinde TS tip-soyma (type stripping) VARSAYILAN açık olduğundan bu çalışır.
# Bu yüzden taban imaj node:22-slim (22.18+) ZORUNLU — daha eskiye düşürmeyin.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# openssl + ca-certificates: Prisma query-engine (debian-openssl-3.0.x) için.
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# 1) TÜM workspace manifest'leri + lockfile → frozen-lockfile eksiksiz workspace
#    ister. Kaynak değişince bu katman cache'ten gelir.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/email/package.json packages/email/package.json
RUN pnpm install --frozen-lockfile

# 2) Kaynak + build. Sıra: shared/email (tsc) → prisma client → api (tsc).
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter @supkeys/shared build \
 && pnpm --filter @supkeys/email build \
 && pnpm --filter @supkeys/db generate \
 && pnpm --filter @supkeys/api build

# 3) Çalıştırma. (prisma CLI + tsx dev-dep olarak kalır: migrate deploy + seed
#    entrypoint'te gerekiyor; imajı ayrıca slimlemek isterseniz docs/deploy.md.)
COPY apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production
ENV API_PORT=4000
EXPOSE 4000
WORKDIR /repo/apps/api

# Konteyner sağlığı — Coolify healthcheck ile aynı uç.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
