# TODO: ExchangeRateService currentRateCache

## Durum

16 Mayıs 2026'da "perf audit + working tree temizlik" PR'ında atıldı. Sebep:
test isolation'ı kırıyordu (3 test fail), bu PR'ın scope'unda değildi.

## Yapılacak (ayrı PR)

- `currentRateCache` (Map<Currency, {rate, expiresAt}>, 5dk TTL) — `getCurrentRate`
  içinde DB lookup'tan kurtaran in-memory cache.
- `invalidateCurrentRateCache()` public metod (test isolation için) —
  `refreshFromTcmb` cron sonrası ve test `beforeEach` içinde çağrılabilsin.
- Integration test setup'ında `beforeEach`'te `service.invalidateCurrentRateCache()`
  çağrısı (cache test'ler arası persist etmesin).
- False pass riski olan testleri yeniden incele — cache hit ile trivially
  geçen test'ler (Claude Code raporu, Adım 5 keşif):
  - `getCurrentRate › DB boş → fallback` (cache miss yolu, OK ama izole test gerek)
  - `getCurrentRates › DB boş → tüm fallback` (toplu fallback path)
  - Yorumlar inceleme listesi PR description'ında.

## Önemli not

Exchange rate **para hesabı**. Cache implementasyonu sırasında yanlış değer
dönerse satış/teklif kayıtlarına yanlış TRY karşılığı yazılır (özellikle
multi-currency tender bid submit'te `takeSnapshot` ile yazılan rate kalıcı
oluyor). Test coverage yüksek olmalı:

- Cache hit / miss
- TTL expire sonrası refresh
- `refreshFromTcmb` sonrası invalidate
- Concurrent çağrılarda race (aynı currency için 2 paralel `getCurrentRate`)

## Referans

- Önceki implementation diff: bu PR'da `git checkout main --` ile atıldı.
  Kod örneği için bu PR'ın "Adım 5 keşif" raporu veya
  `apps/api/src/modules/currency/services/exchange-rate.service.ts`'in
  o tarihteki uncommitted hali.
- Performans audit etiketi: **P-10**.
