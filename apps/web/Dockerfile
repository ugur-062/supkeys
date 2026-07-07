# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Rothern Web (Next.js 15, tenant + supplier) — Coolify/Hetzner imajı.
# output:"standalone" → ~150MB runtime imaj (`node server.js`, `next start` yok).
#
# DİKKAT — NEXT_PUBLIC_* DERLEME ZAMANI gömülür (runtime env DEĞİL). Coolify'de
# bunları BUILD ARGS olarak verin; runtime env olarak vermek ETKİSİZDİR.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# NEXT_PUBLIC_* build args → derleme öncesi ENV'e taşınır.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1

# 1) TÜM workspace manifest'leri + lockfile → frozen-lockfile eksiksiz workspace
#    ister. (Fazladan kurulan app'ler yalnız BUILD katmanında; runtime imaj
#    aşağıda yalnız standalone çıktıyı kopyalar → küçük kalır.)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/email/package.json packages/email/package.json
RUN pnpm install --frozen-lockfile

# 2) Kaynak + build (shared tsc → web next build). Web yalnız @rothern/shared'e
#    bağlı; db/prisma gerekmez.
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN pnpm --filter @rothern/shared build \
 && pnpm --filter @rothern/web build

# ── Runtime: yalnız standalone çıktı ──
FROM node:22-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone kök = repo (outputFileTracingRoot). server.js apps/web altında.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
