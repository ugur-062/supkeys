# API Integration Tests

Gerçek Postgres'e (Supabase) bağlı integration testleri. **İzole `rothern_test`
şeması** kullanır — `public` (dev) verisine asla dokunmaz.

## Çalıştırma

```bash
pnpm --filter @rothern/api test          # tüm suite
pnpm --filter @rothern/api test company-listings   # tek dosya
```

Kök `.env`'deki `DIRECT_URL` otomatik yüklenir; test bağlantısı ona
`?schema=rothern_test` eklenerek türetilir (`test/integration/env.ts`). Ayrı bir
env değişkeni gerekmez.

İlk koşuda `prisma db push` modelleri `rothern_test` şemasına yansıtır ve custom
SQL sequence'leri (`order_number_seq`, `listing_number_seq`) oluşturur
(`global-setup.ts`). Sonraki koşularda "already in sync" → hızlı.

## Yapı

- `env.ts` — kök .env yükler, test şema URL'ini türetir, **şema guard'ı** (test
  bağlantısı `rothern_test` değilse durur).
- `test-db.ts` — test şemasına bağlı PrismaClient + `truncateAll()`.
- `factories.ts` — firma/kullanıcı/ilan/kalem/teklif/bağlantı/davet seed yardımcıları.
- `make-service.ts` — gerçek Prisma + mock'lanmış yan-etki bağımlılıkları
  (approvals/blocks/exchangeRates/email/config) ile `CompanyListingsService`.
- `company-listings.spec.ts` — kapalı zarf, ülke görünürlüğü, IDOR/owner-scope,
  teklif kapıları (F2/F3/F6), kazandırma→sipariş, çift-kazandırma (F1),
  kalem-bazlı (F8), state-machine.

## Notlar

- Paylaşılan DB → `maxWorkers: 1` (paralel koşmaz); her test öncesi `truncateAll`.
- Uzak DB nedeniyle yavaş (~1-7 sn/test); `testTimeout: 30000`.
- CI'da `DIRECT_URL` (veya `DATABASE_URL`) env'i sağlanmalı.
