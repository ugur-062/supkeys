# Tam Sistem Denetimi 2026-08-23 → 2026-08-28 — Kapanış Özeti

12 parça, parça başına 6-7 paralel mercek, her parçada ana oturumda **çürütme turu**
(HIGH/MED iddiaları kod okunarak — mümkün olduğunda çalıştırılarak — doğrulanır;
doğrulanamayan iddia rapora "çürütülen" olarak yazılır). Üretim koduna her parçada
yalnız onaydan sonra dokunuldu.

## Parçalar

| # | Alan | Rapor | Dalga A commit'i |
|---|------|-------|------------------|
| 1 | Kimlik & Oturum | `audit-2026-08-23-part1-auth.md` | `5cc79e4e` |
| 2 | İhale çekirdeği | `audit-2026-08-23-part2-listings.md` | `416aad77` |
| 3 | Sipariş & ödeme | `audit-2026-08-23-part3-orders.md` | `334356e7` |
| 4 | Yetki & çok-kiracılılık | `audit-2026-08-23-part4-tenancy.md` | `54663105` |
| 5 | Depolama & dosya | `audit-2026-08-24-part5-storage.md` | `04ec749f` |
| 6 | AI katmanı | `audit-2026-08-24-part6-ai.md` | `96dd57e4` |
| 7 | İletişim & bildirim | `audit-2026-08-24-part7-comms.md` | `569a52a7` |
| 8 | Onaylar & raporlar | `audit-2026-08-25-part8-approvals-reports.md` | `40ca90b0` |
| 9 | Admin paneli | `audit-2026-08-26-part9-admin.md` | `c883cc3a` + `f17cd3bb` |
| 10 | Web/Admin ön yüz | `audit-2026-08-26-part10-frontend.md` | `be514eea` + `67f79598` |
| 11 | Altyapı & operasyon | `audit-2026-08-27-part11-infra.md` | `3f49891f` |
| 12 | Veri modeli & göç | `audit-2026-08-28-part12-data-model.md` | `HEAD` (2026-08-31) |

## Tekrar eden hata sınıfları

Denetimin en değerli çıktısı tek tek bulgular değil, **12 parçanın tamamında
tekrarlayan altı desen**. Yeni kod yazarken kontrol listesi olarak kullanılmalı:

1. **UI kilidi ≠ API kilidi.** Arayüzde gizlenen/pasifleştirilen her aksiyonun
   servis tarafında karşılığı yok. (P4, P9, P10 — ayrıca 2026-07-28'de ayrı bir tur.)
2. **Sessiz tavan.** `take: 500` / `slice(0, N)` / `top-N` sonucu "hepsi bu"
   gibi sunuluyor; kullanıcı eksik veriyi göremiyor. (P8, P9, P11, P12)
3. **Tek-kaynak yarım kalıyor.** Helper yazılıyor, çağrı yerlerinin bir kısmı
   bağlanmıyor; iki hesap sessizce ayrışıyor. (P8 → P12 #9 aynı helper'ın
   panoya bağlanmamış olması — **benim P8'deki eksik işim**.)
4. **Fail-open kapı.** Veri yoksa "sorun yok" varsayılıyor: eksik kur → varsayılan
   tabloya düşme, eksik adres → `undefined`, `SENTRY_DSN` boşsa alarmların no-op
   olması. Kural: para/yetki/bildirim yollarında **fail-closed**. (P3, P8, P11, P12)
5. **Madde-sonrası ölü satır.** Bir özellik kaldırılınca onu besleyen alan null'a
   düşüyor ama tüketen KPI/alarm satırı kalıyor ve sürekli 0 gösteriyor.
   (P8 `paymentWindow`, P12 #10 `expectedDeliveryDate` — aynı kök, kardeş satır.)
6. **Rig stub gotcha (test).** Yaygın enjekte edilen bir servise YENİ çağrı
   eklendiğinde spec'lerdeki `jest.fn()` stub'ları `undefined` döndürüp
   "x is not a function" üretiyor. Böyle bir değişiklikten sonra **tam API
   suite'i** koşulmalı. (4 kez tekrarladı.)

## Kapanışta açık kalan, insan erişimi gereken işler

Bunlar kod değişikliğiyle kapanmaz; kullanıcının Render/Supabase/Cloudflare
panellerine erişmesi gerekir. Öncelik sırasıyla:

1. **`admin@rothern.com`** — canlı, aktif SUPER_ADMIN, **2FA kapalı**, dev parolası
   (`admin12345`) CLAUDE.md'de yayınlanmış durumda. Parola değiştir + 2FA aç,
   ya da hesabı pasifleştir. *(Doğrulamak için giriş denemesi bilinçli YAPILMADI.)*
2. **Demo firmalar canlıda** (`firma@demo.com` / 2 / 3) — GOLD + VERIFIED, aralarında
   28 ilan / 27 teklif / 28 sipariş üretmiş; 20 firmanın yalnız 5'i gerçek.
   `RUN_SEED` artık `sync: false` ve seed production'da demo atlıyor (P11 Dalga A),
   ama **mevcut kayıtlar duruyor** — temizlik yıkıcı olduğu için ertelendi.
3. **PITR + snapshot** açık değil; `migration-safety.md`'nin tüm rollback güvencesi
   buna dayanıyor ve dev/prod aynı veritabanı (P12 #7).
4. **RLS aktivasyonu** — açılmadan önce P12 #3/#4/#5/#6 kapatılmalı (cron, WebSocket,
   public opt-out bağlamsız kalıyor; iki tablo policy'siz).
5. Resend domain doğrulaması (hâlâ `onboarding@resend.dev`), log drain, alert webhook.

## Not

Parça 12 Dalga A uygulandı (2026-08-31). Aktivasyon-bloklayıcılardan #3 ve #5
kapandı, #4 çürütüldü (zaten kapalıymış), **#6 açık kaldı** — iki tabloya
policy eklemek A2'de. Migration `20260831090000` prod'a henüz uygulanmadı.
