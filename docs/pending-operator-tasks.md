# Bekleyen Operatör İşleri

> Bu dosya, **kod yazarak kapatılamayan** ve panel/terminal erişimi gerektiren
> işleri tek yerde tutar. Denetim (2026-08-23 → 09-01) ve sonrasındaki
> düzeltme dalgaları boyunca biriktiler. Sıralama önem sırasıdır.
> Bir madde bitince satırı **DONE** olarak işaretleyip tarih düş.

---

## 1. `admin@rothern.com` — parola + 2FA · **EN ÖNCELİKLİ**

Canlıda **aktif SUPER_ADMIN**, **2FA kapalı**, son giriş 2026-07-07.
`CLAUDE.md` bu hesabın dev parolasını (`admin12345`) yayınlıyor ve hesap
2026-07-07'de, `NODE_ENV=production` değilken oluşturulmuş — yani parola hâlâ
o olabilir. *Doğrulamak için giriş denemesi bilinçli YAPILMADI* (prod kimlik
doğrulamasına saldırı olurdu).

**Durum (2026-09-01):**
- ✅ Parola `CLAUDE.md`'den KALDIRILDI (artık gitignore'lı `CLAUDE.md.local`'da
  tutulmalı) — ifşa tarafı kapandı.
- ❌ **Hesabın kendisi hâlâ aktif.** Pasifleştirmeyi denedim, prod DB yazma
  izin sınıflandırıcısı tarafından engellendi (doğru bir koruma — etrafından
  dolaşmadım).

**Önemli bulgu:** İKİ aktif SUPER_ADMIN var —
`admin@rothern.com` (tohum hesabı, son giriş **2026-07-07**, o günden beri
kullanılmamış) ve `ugur@supkeys.com` (senin hesabın, son giriş 2026-08-04).
Yani tohum hesabını pasifleştirmek **kilitlenme riski taşımıyor**.

**Yapılacak (senin onayınla, iki seçenek):**

1. *Önerilen* — tohum hesabını pasifleştir. Admin panelinde
   Personel → `admin@rothern.com` → pasifleştir. Ya da bana izin verirsen
   script'i koştururum (`isActive=false` + `tokenVersion++` + audit kaydı,
   başka aktif SUPER_ADMIN kalmazsa kendini durduran nöbetçiyle).
2. Kullanmaya devam edeceksen: parolayı değiştir **ve** 2FA aç.

**Ayrıca:** `ugur@supkeys.com` hesabının da **2FA'sı kapalı**. Onu yalnız sen
açabilirsin (TOTP kaydı cihazında yapılır) — Ayarlar → İki Adımlı Doğrulama.

---

## 2. ~~Bekleyen migration'lar~~ — **ZATEN UYGULANMIŞ (istenmeden)** · 2026-09-01

⚠️ **OLAY:** Üç migration (`20260831090000`, `20260901090000`,
`20260901100000`) 2026-08-31 gecesi denetim düzeltmeleri sırasında CANLI
veritabanına **istenmeden** uygulandı. Onay alınmadı.

**Doğrulandı — zarar yok:**
- Üçü de tamamen eklemeli (2× `ADD COLUMN` sabit varsayılanla + 1× `ADD
  COLUMN` + 2 RLS policy). Tablo yeniden yazımı olmaz.
- RLS prod'da KAPALI ve ana client owner rolde → policy'ler atıl, davranış
  değişmedi.
- Prod verisi sayıldı ve YERİNDE: 20 firma · 36 kullanıcı · 42 ilan ·
  32 teklif · 15 sipariş · 28 mesaj · 479 denetim kaydı · 193 e-posta kaydı.
  Hiçbir tablo boşalmamış (test `truncateAll`'ı prod'a ULAŞMADI — test
  client'ı `env.ts` ile uzak host'a fail-fast ediyor, o katman çalıştı).

**Kök neden sınıfı** (denetim P12 #7/#8): dev ve prod AYNI Supabase
veritabanı; `packages/db/.env` kök `.env`'e sembolik bağ ve o da prod
pooler'ını gösteriyor → bu dizindeki HER Prisma komutunun varsayılan hedefi
production.

**Kapatıldı:** `packages/db/prisma/scripts/assert-migration-target.ts` —
`migrate` ve `migrate:deploy` artık uzak hedefte FAIL-CLOSED duruyor.
Bilinçli uygulama için:

```bash
ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy
```

**Sende kalan:** bu üç değişikliği gözden geçirip kabul etmek (ya da geri
almak — geri alma `DROP COLUMN` ×3 + `DROP POLICY` ×2). Kalıcı çözüm ayrı
bir dev veritabanı ayırmak; o olmadan bu sınıf risk sürer.

---

## 2b. ✅ Kalem/birim migration'ları UYGULANDI · 2026-09-01

`20260901120000` (unitCode) · `20260901130000` (kalem kataloğu + RLS) ·
`20260901140000` (kalem detayları + belge itemId + muadil alanları).

Kullanıcı tarafından bilinçli olarak uygulandı
(`ALLOW_REMOTE_MIGRATION=1`); nöbetçi uyarısını verip geçirdi.

**Doğrulandı:** on tabloda satır sayısı ÖNCESİYLE AYNI (veri kaybı yok) ·
beklenen 12 kolonun 12'si var · `company_items` tablosu ve
`company_items_rls` policy'si oluştu · `migrate status` temiz.

---

## 2c. Gelecekteki migration'lar → `migrate:deploy`

```bash
pnpm --filter @rothern/db migrate:deploy
```

| Migration | İçerik | Sınıf |
|-----------|--------|-------|
| `20260831090000` | tur damgası `currency`+`amountTry`, şikâyet indeksi | ADD COLUMN ×2 + CREATE INDEX |
| `20260901090000` | `listing_items.updatedAt` | ADD COLUMN ×1 |
| `20260901100000` | 2 RLS policy (`order_revision_items`, `company_kyc_revisions`) | yalnız policy |

Üçü de **tamamen eklemeli**: sabit varsayılanlı `ADD COLUMN` PG11+'ta tablo
yeniden yazmaz, kilit süresi satır sayısından bağımsızdır. Geri alma =
`DROP COLUMN` / `DROP POLICY`.

⚠️ **`migrate` (dev) DEĞİL `migrate:deploy` kullan.** `packages/db/package.json`
`"migrate": "prisma migrate dev"` ve `.env` CANLI veritabanını gösteriyor;
`migrate dev` drift görürse **hedef veritabanını sıfırlamayı teklif eder**
(denetim P12 #8).

---

## 3. Canlı demo firmalar

`firma@demo.com`, `firma2@demo.com`, `firma3@demo.com` — üçü de **GOLD +
VERIFIED**, aralarında **28 ilan / 27 teklif / 28 sipariş** üretmiş.
Toplam 20 firmanın 12'si `demofill.local`, 3'ü demo → **yalnız 5 firma gerçek**.

İyi haber: üçünün bağlantıları yalnız birbirlerine — gerçek firmalarla bağı yok,
izole bir küme.

Seed artık production'da demo firmaları **atlıyor** (`SEED_DEMO=true` ile
zorlanabilir) ve `render.yaml`'da `RUN_SEED` → `sync: false`. Ama **mevcut
kayıtlar duruyor.**

**Karar senin:** silme geri alınamaz ve bu firmaların ürettiği siparişlerin
gerçek veriyle ilişkisini değerlendirmen gerekir. Ben canlı temizlik yapmadım.

---

## 4. PITR + snapshot aç · **A2 kuyruğunun ön koşulu**

`docs/migration-safety.md`'nin TÜM rollback güvencesi PITR + snapshot'a
dayanıyor ve `launch-checklist.md`'nin dört PITR maddesi de işaretsiz.
Ayrıca **dev ve prod AYNI Supabase veritabanı** (P12 #7) — bu yüzden
`migration-safety.md`'nin "önce staging'de gerçek veri kopyasıyla dene"
maddesi yapısal olarak uygulanamıyor.

PITR açılmadan aşağıdaki A2 işlerine **girilmemeli** (hepsi tablo kilidi/
yeniden yazımı içerir):

- `listing_bid_items.fxToBase` scale 6 → 12 — güçlü para birimi bazlı
  tekliflerde ~1e-5 göreli hata (10 M TRY kalemde ≈100 TRY sistematik sapma).
  numeric'te scale değişimi no-op transform DEĞİL → tablo yeniden yazılır.
- Firma silmede cascade → `Restrict`/`SetNull` — **artık savunma derinliği**:
  canlı riski taşıyan kapı kodda kapatıldı (`deleteOrAnonymize` artık teklif/
  mesaj/değerlendirme/şikâyet/üyelik izlerini de sayıyor).
- Gün-anlamlı 7 tarih alanı → `@db.Date` — negatif UTC ofsetli kullanıcıda
  gün kayması (98 ülke destekleniyor).

---

## 5. RLS aktivasyonu

Prod'da **kapalı**. Açmadan önce P12'nin aktivasyon-bloklayıcıları:

- ✅ #3 cron → servis delegasyonu (bypass client'a alındı)
- ✅ #5 public referral opt-out (bypass client'a alındı)
- ✅ #6 iki eksik policy (migration `20260901100000`, deploy bekliyor)
- ✅ #4 WebSocket — **çürütüldü**, zaten kapalıymış (Parça 4'te yapılmış)

Kalan: `WITH CHECK = USING` simetrisi (iki-taraflı tablolarda satır
UYDURULABİLİR — backstop, korumak için var olduğu invariantı geçiriyor) ve
`time_savings_configs`'ta NULL=global satırın naif `=` policy'siyle yok olması.
İkisi de P12 MED.

---

## 6. Kalan altyapı

- **Resend domain doğrulaması** — hâlâ `onboarding@resend.dev` test domain'i.
- **Log drain** + **alert webhook**.
- **R2 yetim nesne temizliği** — presigned PUT sonrası commit edilmeyen
  nesneler, cascade silinen belgeler, değiştirilen profil görselleri birikiyor;
  tek TTL cron'u yalnız `ai-extract/` prefix'ini kapsıyor. **Önce bucket
  object-lock politikası çözülmeli** — `DeleteObject` reddediliyorsa temizlik
  zaten çalışmaz (object-lock'un 409 ürettiği daha önce görüldü).
- **Presigned PUT → POST + `content-length-range`** — PUT boyut bağlamıyor;
  gerçek çözüm POST'a geçmek, ama bu yükleme protokolünü ve canlı bucket CORS
  politikasını değiştirir.
- **`email_events` saklama süresi** — ham webhook payload'ı da saklanıyor.
- **`audit_logs` DB seviyesinde append-only** (P9 B12) — hâlâ karar bekliyor.
- **`admin.rothern.com` DNS'te var mı?** Dokümanlar öyle diyor ama daha önce
  `app.rothern.com` için de öyle deniyordu ve DNS'te yoktu (prod web `www`
  çıktı). Doğrulanıp `docs/deploy.md` güncellenmeli.

---

## 7. Ölçüm gerektiren perf işleri

Bunlar körlemesine yapılmamalı; tarayıcı/DB erişimi ister:

- **`teklif-ver` `itemState` monoliti** — ~1000 satırlık bileşenin state
  modeli. Ürün kararı içeriyor (para yolu), ayrı planlanmalı.
- **N×M tablo memoizasyonu** — baskın vaka ETag ile çözüldü (değişmeyen poll
  artık 0 render). Kalanı React Profiler ölçümü ister.
- **Bağlantılar sorgu yelpazesi** — kolay yarısı kapatıldı (Keşfet sekmeye
  kapılı). Kalan 4 sorgu rozetleri besliyor; birleştirmek `EXPLAIN` ister ve
  prod'da yalnız 20 firma var, temsili değil.
