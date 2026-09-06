# Web E2E Tests (Playwright)

Browser-based UI tests for the rothern web app.

> **Durum (2026-09-06):** `public-products-filters.spec.ts` — herkese açık
> `/urunler` süzgeç senaryosu (şehir seç → URL → sayaç → geri tuşu; 7 yuvalı
> sayfalama). Pazar yeri anahtarı açık bir web sunucusu ister:
> `PLAYWRIGHT_BASE_URL=http://localhost:3005 npx playwright test e2e/public-products-filters.spec.ts`.
> `company-tenders.spec.ts` panel smoke'u (giriş ister).

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

Yeni spec'ler için dev hesapları (birleşik Company sistemi):

- `firma@demo.com` / `Demo1234!` (PAKET, tüm roller — ihale açabilir)
- `firma2@demo.com` / `Demo1234!` (TR, firma@demo'ya bağlı — teklif verebilir)

## CI

CI'da çalıştırmak için:
1. Workflow'da `pnpm exec playwright install --with-deps chromium`
2. API + web background'da başlat
3. `pnpm --filter @rothern/web e2e`
