# Web E2E Tests (Playwright)

Browser-based UI tests for the supkeys web app.

## Prerequisites

Linux sistemde Chromium'un ihtiyaç duyduğu kütüphaneler kurulmalı:

```bash
sudo apt-get update
sudo apt-get install -y \
  libnspr4 libnss3 libnss3-tools \
  libdbus-1-3 libxkbcommon0 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64
```

(Tek seferlik kurulum. Playwright bunu `pnpm exec playwright install-deps`
ile de yapabilir ama sudo ister.)

## Çalıştırma

API + web dev server'ı önceden başlat:

```bash
pnpm dev   # root'tan
```

Sonra test:

```bash
cd apps/web
pnpm e2e          # headless
pnpm e2e:headed   # browser görünür modda
```

## Test fixture'ları

Test başlatılmadan önce DB'de bu user'lar mevcut olmalı:

- `buyer@demo.com` / `Buyer1234` (BUYER role, tender oluşturabilir)
- `auction-a@test.local` / `Auction1234` (supplier — auction test scripti'nden
  gelir; yoksa `apps/api/test/integration/auction.test.ts` çalıştırılınca
  oluşur)

## CI

CI'da çalıştırmak için:
1. Workflow'da `pnpm exec playwright install --with-deps chromium`
2. API + web background'da başlat
3. `pnpm --filter @supkeys/web e2e`
