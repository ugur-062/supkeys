# Performans Notları — ölçek tetikleyicileri

Bugün küçük tablolar için doğru olan bazı kararlar, veri büyüyünce yeniden ele
alınmalı. Bu dosya "ne zaman ne yapılmalı" tetikleyicilerini kaydeder (bugünkü
latency'ye göre DEĞİL, ileriye dönük).

## Sipariş listesi — client-side'dan server-side'a geçiş tetikleyicisi

**Bugünkü durum (2026-07-16):** `GET /company/orders` firmanın TÜM siparişlerini
(tavan `ORDERS_LIST_CAP = 1000`, `company-orders.service.ts`) tek dizi olarak
döner. Frontend `OrdersList` (`apps/web/.../components/company/orders-list.tsx`)
her şeyi **client-side** yapar: rol ayrımı, KPI'lar, durum-filtre sayaçları,
karşı-taraf listesi, arama, tarih/kaynak filtreleri, sıralama, sayfalama.

Eski `take: 200` tavanı 200+ siparişli firmanın eski kayıtlarını **erişilemez**
kılıyordu (KPI/arama/filtre onları hiç görmüyordu). Tavan 1000'e çıkarıldı +
`list()` yalnız `serialize()`'ın kullandığı alanları `select` eder (1000 şişkin
satır payload'ını önler).

**TETİKLEYİCİ — şu olduğunda `OrdersList` server-driven'a taşınmalı:**
- Bir firma **~800 siparişe** yaklaşıyor (1000 tavanına doğru), VEYA
- Liste sayfası render'ı / ilk yükleme **hissedilir yavaşlıyor** (binlerce satır
  DOM + client-side filtre/sıralama tarayıcıyı zorluyor).

**Geçiş kapsamı (o zaman yapılacak — şimdi DEĞİL, feature rewrite):**
- Backend: `list()`'e sorgu parametreleri — `role`, `status`, `srcType`,
  `counterparty`, `range`, `search`, `sort`, `page`, `pageSize`; dönüş
  `{ rows, total, page, pageSize, statusCounts, counterparties, kpis }`
  (KPI/sayaç/karşı-taraf-distinct backend'de agrega edilir).
- Frontend: `OrdersList` server-driven — debounced arama, filtre→query params,
  server pagination; client-side filtre/KPI mantığı kaldırılır.
- Test: filtre/sıralama/KPI paritesi (server çıktısı eski client davranışıyla
  birebir).

Bu, perf turunun kapsamı DEĞİLDİR — bilinçli ertelendi (client-side mimariyi
naif envelope+pager bozardı: KPI/filtre/sayaç yalnız sayfayı yansıtırdı).
