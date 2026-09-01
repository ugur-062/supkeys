# Rothern — Launch Checklist

Prod deploy öncesi tamamlanması gereken ödeme/plan, env ve doğrulama adımları.
Servis fail davranışları [dış servis envanteri](#dış-servis-fail-davranışı-özet)
tablosunda özetlendi — **hangi eksik sessizce geçer, hangisi app'i boot ettirmez**
ayrımı kritik.

> **En tehlikeli tek nokta:** `SENTRY_DSN`. Diğer tüm çekirdek servisler (Supabase,
> R2, Resend) env'i eksikse app **boot etmez** (fail-closed, hatayı hemen görürsün).
> Sentry ise eksikse **sessizce no-op** olur — error tracking + kritik-audit/webhook
> alarmları tümüyle pasif kalır ve sistem seni uyarmaz. Deploy'da ilk doğrula.

---

## ✅ Tamamlandı — R2 iki-bucket ayrımı (prod'da canlı doğrulandı)

İki-bucket ayrımı **tamamlandı ve prod'da canlı test edildi** (2026-07-16). KYC ve
kapalı-zarf teklif belgelerinin imzasız public ifşası (INV-STORAGE-1'in kapattığı
açık) prod ortamında fiilen kapalı. Kanıt (gerçek key ile):

| Test | Sonuç | Anlamı |
|---|---|---|
| Gerçek public logo → `cdn.rothern.com/prod/tenant-profile/…` | **200** + image/jpeg | CDN → PUBLIC bucket'a bağlı |
| Aynı gerçek private KYC key → `cdn.rothern.com/company-docs/…` | **404** | Private belge public domain'den servis edilmiyor |
| Aynı gerçek private KYC key → private S3 endpoint, **imzasız** | **400** (nesne yok) | Private bucket public değil; yalnız imzalı (presigned) erişim |

Bu üçü birlikte hem "CDN yanlış bucket'a bağlı" hem "presign baypası" senaryolarını
kesin eler. Meşru presigned URL (imzalı) ile aynı key çekilebilir.

### Kalıcı kurallar (deploy/altyapı — İHLAL = güvenlik açığı)

- **`supkeys-documents` (PRIVATE bucket):** public dev URL (`*.r2.dev`) ve custom
  domain **ASLA** açılmamalı. Yalnız presigned. Açılırsa key'i bilen herkes
  KYC/teklif/satın alma talebi/sipariş belgesini imzasız çeker.
- **`rothern-public` (PUBLIC bucket):** yalnız `{env}/tenant-profile/` prefix'i
  bulunur; custom domain (`cdn.rothern.com`) yalnız buna bağlı. Kod tarafında
  **INV-STORAGE-1** kilitliyor (`docs/invariants.md`): başka prefix public URL'e
  çevrilemez, hassas anahtar public bucket'a yazılamaz (`assertKeyBucket`).
- **Bucket adı tutarsızlığı** (`supkeys-documents` (private) vs `rothern-public`
  (public)) **bilinçli olarak bırakıldı** — kozmetik, kullanıcıya görünmüyor,
  yeniden adlandırma riskine değmez.

Ayrıntı: `docs/r2-bucket-split.md` (Cloudflare kurulum + rollback).

---

## Ödeme / plan (launch öncesi)

### Supabase (DB + Auth)

> **TETİKLEYİCİ:** İlk gerçek müşteri verisi girmeden ÖNCE, launch'tan **en az
> birkaç gün önce** yapılacak (tatbikat için marj gerekir).

1. [ ] Supabase **Pro'ya yükselt**
2. [ ] **PITR eklentisini AYRICA aç** — Pro otomatik getirmiyor, **en sık atlanan adım**
3. [ ] **Retention'ı panelde teyit et** (hedef **≥30 gün**)
4. [ ] **Restore tatbikatı:** bir backup'ı **YENİ bir projeye** geri yükle, verinin
       geldiğini gör. **Prod'a DEĞİL.** Bu yapılmadan "backup'ım var" denmez.

> **KIRMIZI ÇİZGİ:** Free planda gerçek müşteri verisiyle çalışılmaz.

### Render (API barındırma)
- [ ] Plan kontrolü — **ücretsiz tier'da servis uyur** (ilk istekte cold start
      gecikmesi); ticari kullanımda yükselt

### Vercel (web + admin barındırma)
- [ ] Plan kontrolü — **Hobby tier ticari kullanımda ToS sorunu** olabilir, Pro'ya bak

### Cloudflare R2 (dosya depolama)
- [ ] Kota / ödeme kontrolü
- [ ] **Object versioning AÇ** — Supabase PITR yalnızca DB'yi kapsar, **R2
      dosyalarını kapsamaz**; versioning yoksa silinen belge geri gelmez

### Resend (e-posta)
- [ ] Plan / limit kontrolü — **davet e-postası gitmezse müşteri sisteme giremez**
      (buyer yalnız davet linkiyle kayıt olabiliyor)

### Sentry + UptimeRobot
- Ücretsiz tier yeterli — yükseltme gereksiz.

---

## Prod env değişkenleri

| Env | Eksikse ne olur | Aksiyon |
|---|---|---|
| `SENTRY_DSN` | ⚠️ **Sessizce no-op** — error tracking + tüm alarmlar pasif, sistem uyarmaz (tek fail-open servis) | **Set et ve doğrula** |
| `R2_PUBLIC_BASE_URL` | Görseller 60 dk sonra kırılıyor (geçici presigned URL'e düşer) | Set et (custom domain veya `pub-XXXX.r2.dev`) |
| `RESEND_WEBHOOK_SECRET` | Delivery/bounce/complaint tracking yok; imzalı webhook doğrulanamaz | Set et (Resend → Webhooks → Signing Secret) |
| `ANTHROPIC_API_KEY` | AI "Hakkımızda" özelliği kapanır (heuristik fallback'e düşer) | Opsiyonel |
| `NEXT_PUBLIC_API_URL` | Frontend API'ye ulaşamaz | **Vercel build-time — şart** |
| `NEXT_PUBLIC_SITE_URL` | SEO canonical/sitemap/robots bozulur | **Vercel build-time — şart** |
| `COOKIE_SAMESITE` | ⚠️ Boşsa prod'da `none` → **CsrfGuard komple bypass, CSRF açık** | **Same-site domain'de `lax`** (aşağıdaki sıralı adım) |
| `CORS_ALLOW_VERCEL` | `true` ise **her `*.vercel.app`** credentials'lı istek atabilir (CSRF/veri sızıntısı) | Prod'da **boş/`false`**; yalnız preview/demo'da `true` |

- [ ] `SENTRY_DSN`
- [ ] `R2_PUBLIC_BASE_URL`
- [ ] `RESEND_WEBHOOK_SECRET`
- [ ] `ANTHROPIC_API_KEY` (opsiyonel)
- [ ] `NEXT_PUBLIC_API_URL` (Vercel build arg)
- [ ] `NEXT_PUBLIC_SITE_URL` (Vercel build arg)
- [ ] `COOKIE_SAMESITE` (aşağıdaki CSRF sırası)
- [ ] `CORS_ALLOW_VERCEL` prod'da kapalı

> **Not:** Supabase / R2 / Resend env'leri eksikse app **BOOT ETMEZ** (fail-closed,
> güvenli) — `onModuleInit`'te throw eder, deploy anında yakalanır.

---

## CSRF / Cookie güvenliği (KRİTİK — sıra önemli)

**Sorun:** CsrfGuard double-submit koruması fail-closed yazılmış AMA `COOKIE_SAMESITE`
boşsa prod'da `none`'a düşüyor; `none` modunda guard KOMPLE bypass oluyor
(`csrf.guard.ts:70`) → CSRF koruması yalnız CORS'a kalıyor. Bu yüzden aşağıdaki
**SIRALI BAĞIMLILIK** izlenmeli — ters sıra girişi kırar:

- [x] **1) Custom domain'leri bağla:** API → `api.rothern.com` (Render, Cloudflare
      proxy), web → `www.rothern.com`, admin → `admin.rothern.com` (Vercel). Hepsi
      `rothern.com` altında = **same-site**. *(2026-07-25 canlıda doğrulandı; apex
      `rothern.com` → www'ye 308. DİKKAT: eski taslaklardaki `app.rothern.com` HİÇ
      kurulmadı — web'in gerçek domain'i `www`.)*
- [x] **2) DOĞRULA:** üç domain de HTTPS'te açılıyor + `NEXT_PUBLIC_API_URL=https://api.rothern.com/api`
      + `COOKIE_DOMAIN=.rothern.com` + `CORS_ORIGINS` yalnız gerçek domain'ler.
      *(2026-07-25: üç domain HTTPS'te 200 doğrulandı.)*
- [x] **3) SONRA `COOKIE_SAMESITE=lax` set et** → CsrfGuard double-submit'i (header
      eksik/boş → 403) VE tarayıcı SameSite backstop'u AÇILIR. *(Artık boot guard'lı:
      `assertProdConfigSanity` prod'da `none`/unset'i VE `COOKIE_DOMAIN`'siz `lax`'ı
      REDDEDER — yanlış kombinasyon deploy'da patlar; api canlıda ayakta ⇒ set edilmiş.)*
- [ ] **4) `CORS_ALLOW_VERCEL` prod'da boş/`false`** (kod default false) — `*.vercel.app`
      joker origin'i kapalı kalsın. (Render env'inden gözle doğrula.)

> ✅ **GEÇİŞ TAMAMLANDI (2026-07-25):** ham provider domain'leri
> (`supkeys-web.vercel.app` + `rothern-api.onrender.com`, cross-site) fazı geride —
> custom domain'ler bağlı, same-site kurulum aktif. O faza özgü uyarılar (lax'ın
> cross-site'ta girişi kırması, demo vercel-origin'inin CORS'a eklenmesi) kaldırıldı;
> gerekirse git geçmişinde. Prod artık cross-site'a DÖNEMEZ: boot guard `none`'u reddeder.

---

## Admin paneli (LAUNCH-BLOCKER — KYC ve premium bu panele bağlı)

**Gerekçe:** `assertVerified` kapısı (INV-KYC-1) KYC onayını **manuel admin işi** yaptı;
self-upgrade `PREMIUM_SELF_UPGRADE_ENABLED=false` ile kapatıldı (INV-TIER-1) → premium
**yalnız admin grant**. İkisi de admin paneli olmadan çalışmaz → admin deploy'u
launch-blocker. Tedarikçi VERIFIED olmadan **teklif veremez**, firma PAKET olmadan
**satın alma talebi açamaz**.

- [ ] `apps/admin`'i Vercel'e deploy et
- [ ] `admin.rothern.com` custom domain'ini bağla (CSRF sırası için de gerekli — `*.rothern.com` same-site)
- [ ] Render `CORS_ORIGINS`'e admin origin'ini ekle (`https://admin.rothern.com`)
- [ ] Vercel'de admin env'lerini set et (`NEXT_PUBLIC_API_URL=https://api.rothern.com/api` — **build arg**)
- [ ] **İlk PlatformAdmin hesabı — YÖNTEM: seed (RUN_SEED).** Manuel SQL / ayrı CLI YOK. Mekanizma (doğrulandı):
  - Render API konteyner entrypoint'i (`apps/api/docker-entrypoint.sh`) her boot'ta
    `prisma migrate:deploy` çalıştırır; **`RUN_SEED=true` ise** ardından
    `pnpm --filter @rothern/db seed` (`packages/db/prisma/seed.ts`) koşar.
  - `seed.ts → ensureSuperAdmin()`: `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD`
    (+ opsiyonel `INITIAL_ADMIN_FIRST_NAME`/`LAST_NAME`) env'lerini okur → Supabase
    auth kullanıcısı (`platform_admin`) + `PlatformAdmin` kaydı (`SUPER_ADMIN`) oluşturur.
    Idempotent (varsa atlar) — tekrar boot güvenli.
  - **Prod güvenlik:** `NODE_ENV=production`'da zayıf/örnek parola (`admin12345`, `changeme`,
    <12 karakter) **reddedilir** (throw → deploy fail). Güçlü sır kullan (`openssl rand -base64 24`).
  - Adım: (1) Render'da `RUN_SEED=true` + `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` set et
    → (2) deploy → log'da `✅ Super Admin oluşturuldu` gör → (3) **`RUN_SEED=false` yap** ve
    `INITIAL_ADMIN_PASSWORD`'u kaldır (env'de canlı sır bırakma; her boot'ta gereksiz seed).
  - Giriş: `admin.rothern.com/admin/login` (JWT tipi `admin`; ayrı realm).
- [ ] **UÇTAN UCA TEST (bu zincir hiç test edilmedi):** firma kaydol → e-posta doğrula →
      6 KYC belgesi yükle → **admin panelden VERIFIED yap** → firma artık **teklif verebiliyor
      mu?** (`assertVerified` kapısı devrede — VERIFIED öncesi placeBid/award 403 vermeli).
- [ ] **Premium grant testi:** admin panelden bir firmaya PAKET ver (`setTier`) → firma
      **satın alma talebi açabiliyor mu?** (self-upgrade flag kapalı → admin grant tek yol).

---

## RLS aktivasyon (multi-tenant backstop, INV-MT-5)

> **DURUM (2026-07-21): RLS LOKAL ROLLOUT TAMAM ama PROD'DA KAPALI.** **27 tablo gerçek
> policy'li** (9 direct + 2 transitif + 6 iki-taraflı + 2 mesaj + 4 kapalı-zarf[bid+child] +
> 5 orders[+child] — hepsi `rls-isolation.spec`'te kısıtlı rol + `RLS_ENABLED=true` ile
> izolasyon-kanıtlı, full-suite yeşil, fail-closed). **listings + children + 4 directory
> tablo bilinçli PERMISSIVE** (görünürlük tek-helper servis kapısında, INV-MT-5 İLKE'si).
> Prod'da: (a) `RLS_ENABLED` set değil → extension passthrough, (b) prod `DATABASE_URL`
> owner rolü → policy'ler bypass → **hiçbir davranış değişmedi.** Aktivasyon = ayrı/taze
> tur, önce staging. Plan/detay: `docs/rls-plan.md`.
>
> ⚠️ Bu bir **veri-izolasyonu** değişikliği: yanlış aktivasyon = sessiz boş yanıt / kullanıcı
> verisini göremez. `docs/migration-safety.md` + PITR/snapshot ZORUNLU.

- [ ] **1. Kısıtlı rol provision (İLK ENGEL — önce çöz).** `rothern_app` (LOGIN NOSUPERUSER
      NOBYPASSRLS) migration lokalde çalışıyor AMA **Supabase'de `CREATE ROLE` süper-yetki
      ister** → dashboard/SQL editor'den mi çalışır, farklı grant modeli mi gerekir? Bunu
      NET çöz (grant'ler = migration 20260719130000 SQL'i). Rol parolası migration'da YOK →
      elle `ALTER ROLE rothern_app WITH PASSWORD ...` (secret manager'a, repo'ya YAZMA).
      **AYRICA pooler auth (KRİTİK bilinmeyen):** Supabase transaction pooler (6543) custom
      rolle auth kabul ediyor mu? `rothern_app` ile pooler'dan bağlan + `SET LOCAL`'in tx
      içinde tuttuğunu test et. Reddederse → direct 5432 / alternatif strateji (aktivasyonu bloklar).
- [ ] **2. `DATABASE_URL_BYPASS` = owner rol connection string** (Render env). admin/auth
      pre-context/public katalog/cron bunu kullanır. Ana URL kısıtlı role dönünce bypass'ın
      **ayrı owner URL'i ŞART** (yoksa admin/cron/auth kırılır).
- [ ] **3. Migration'ları prod'a uygula** (`migrate deploy`): rol + ENABLE RLS + policy'ler.
      FORCE'suz → owner hâlâ bypass → uygulama owner URL'indeyken DAVRANIŞ DEĞİŞMEZ (yalnız DDL).
- [ ] **4. `RLS_ENABLED=true` — ama ÖNCE KADEMELİ.** Hepsini birden çevirme: bir(kaç) tabloyu
      enforce et (diğerlerini `DISABLE ROW LEVEL SECURITY` bırak veya kısıtlı role dar kapsam),
      canlı test et, sonra kalanları aç. Ana `DATABASE_URL`'i kısıtlı role çevirmek + flag birlikte
      = gerçek aktivasyon anı. **Önce staging.** Sıra: env değiştir → tek instance → duman → yayılım.
- [ ] **5. Kill-switch TESTİ (aktivasyondan önce prova).** `RLS_ENABLED=false` ile saniyeler
      içinde kapanıyor mu — ÖLÇ. Üç yol, en hızlıdan: **(a)** `DATABASE_URL`→owner rol (anında,
      DDL'siz). **(b)** `RLS_ENABLED=false` (extension no-op). **(c)** `ALTER TABLE x DISABLE ROW
      LEVEL SECURITY` (tablo bazında, son çare). İlk pencerede (a)'yı elinin altında tut.
- [ ] **6. Geri-alma migration'ı hazır:** policy DROP migration'ı önceden yaz/gözden geçir
      (her `CREATE POLICY` için `DROP POLICY IF EXISTS` + gerekirse `DISABLE ROW LEVEL SECURITY`).
- [ ] **7. Aktivasyon SONRASI canlı doğrulama (ZORUNLU).** İki farklı tenant hesabıyla giriş →
      her biri YALNIZ kendi verisini görüyor + cross-tenant boş/403. **Giriş + kritik akışları
      (kayıt/verify/2FA/reset, teklif, kazandır, sipariş, ödeme) MUTLAKA canlı test et.** Cron'lar
      (vade/döviz/bildirim) bypass ile çalışıyor mu. Boş-yanıt alarmı / canary izle.
      ⚠️ **RİSK:** tenant-bağlamı geçmeyen bir yol prod'da BOŞ döner (fail-closed = iyi, sessiz
      yanlış-tenant değil) — ama bu bir kritik akışı sessizce kırabilir; #7 canlı testi bu yüzden şart.

## Netleştirilecek (deploy öncesi karar)

- [ ] **Hosting gerçekte nerede?** `render.yaml` "Render (API) + Vercel (web/admin)"
      diyor; `.env.production.example` başlığı "Coolify/Hetzner" diyor — **çelişki
      var, doğrula** ve tek doğru konfigürasyonda birleştir.
- [ ] **Ölü env temizliği:** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      artık kullanılmıyor (frontend'den `@supabase/supabase-js` kaldırıldı) —
      `.env.example` + `.env.production.example`'dan kaldırılabilir.

---

## Fast-follow (launch sonrası teknik borç)

- [ ] **Profil görseli değişince/kaldırılınca eski R2 nesnesini sil (best-effort).**
      Bugün silinmiyor → public bucket'ta yetim logo/kapak/galeri nesneleri birikir
      ve eski `cdn.rothern.com/{eski-key}` URL'i kalıcı erişilebilir kalır.
      logo/kapak key'i dosya adını içerdiğinden farklı ad = yeni nesne (overwrite
      garantisi yok); galeri her yüklemede `randomUUID`. Çözüm: yeni yükleme/
      `photos[]` çıkarma öncesi `deleteObject("public", eskiKey)` (best-effort) —
      ve/veya logo/kapak key'inden dosya adını çıkarıp gerçekten sabit key.
      (`company-profile.service.ts`, `storage.service.ts:buildTenantProfileKey`.)

---

## Dış servis fail davranışı (özet)

| Servis | Rolü | Eksikse |
|---|---|---|
| Supabase Postgres | Ana DB | **Fail-closed** — health `degraded`, DB istekleri patlar |
| Supabase Auth | Login/register/reset | **Fail-closed (boot)** — env eksikse app boot etmez |
| Cloudflare R2 | Dosya depolama | **Fail-closed (boot)** — env eksik/placeholder → boot etmez |
| Resend | Transactional e-posta | **Fail-closed (boot)** — `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` yoksa boot etmez |
| Resend Webhook | Delivery tracking | **Fail-closed (imza)** — secret yok+prod → 401 + Sentry error |
| **Sentry** | Error tracking + alarm | ⚠️ **Fail-open** — sessiz no-op, uyarı yok |
| TCMB | Döviz kuru | Graceful — `null` döner, son iyi kur + health `degraded` |
| Anthropic | AI "Hakkımızda" | Graceful — heuristik fallback, özellik kapanmaz |

## Denetim 2026-08-23 Parça 1 eklemeleri (Kimlik & Oturum)

- [ ] **`TRUST_CF_CONNECTING_IP=true`** (Render env): api Render'ın Cloudflare ön ucu arkasında → throttle/audit IP'si `cf-connecting-ip`'den okunur (aksi halde tüm kullanıcılar CF IP'sinde toplanır, ortak 429). Self-host/CF'siz kurulumda `false`.
- [ ] **`TOTP_ENC_KEY`** (opsiyonel): TOTP sırrı şifreleme anahtarı; yoksa JWT_SECRET türevi kullanılır. **JWT_SECRET rotasyonundan ÖNCE** bu değişkeni ESKİ JWT_SECRET değeriyle sabitle (yoksa tüm authenticator girişleri kırılır).
- [ ] **Supabase Auth dashboard sertleştirme:** Authentication → Sign In/Up → "Allow new users to sign up" **KAPAT** (kayıt bizim API'den admin createUser ile; anon key + GoTrue `/signup` yetim auth.users üretmesin), Rate Limits sıkılaştır, e-posta şablonları/SMTP kontrol. Anon key'i sır sınıfında tut (web/admin bundle'ında YOK — olmamalı).
- [ ] **Admin oturum iptali:** parola değişimi / SUPER_ADMIN reset / 2FA değişimi `tokenVersion++` → eski admin cookie'leri düşer (migration 20260823100000).
- [ ] Sentry: istek verisi (cookie/header/body) artık gönderilmiyor — DSN'i girince event'te `request.cookies` olmadığını bir kez doğrula.
