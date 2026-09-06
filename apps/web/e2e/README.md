# Web E2E Tests (Playwright)

Browser-based UI tests for the rothern web app.

> **Durum (2026-09-06):** herkese açık spec'ler —
> `public-products-filters.spec.ts` (`/urunler`: şehir seç → URL → sayaç →
> geri tuşu; 7 yuvalı sayfalama), `public-lists-filters.spec.ts`
> (`/firmalar` + `/alim-talepleri` aynı kabuk) ve `public-header.spec.ts`
> (mega menü + typeahead + 390 px'te yatay taşma yok). Pazar yeri anahtarı
> AÇIK bir web sunucusu ister (`NEXT_PUBLIC_MARKETPLACE_LIVE=true`):
> `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/public-header.spec.ts`.
> Not: header spec'i typeahead'i hidrasyondan sonra sürer — `next dev`
> koşarken `pnpm build` ÇALIŞTIRMA, aynı `.next` dizinini ezer ve sayfa
> hidrate olmaz (süzgeç tıklamaları sessizce ölür).
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
