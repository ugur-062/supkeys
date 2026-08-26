# Denetim 2026-08-27 — Parça 11: Altyapı & Operasyon

Kapsam: `render.yaml`, `apps/api/Dockerfile` + entrypoint, `vercel.json` ×2,
`.github/workflows/test.yml`, `apps/api/src/main.ts` + `common/config/**` +
`common/logging/**` + `common/cron/**`, 6 scheduler (12 iş), dış servis
istemcileri (Supabase/Resend/R2/TCMB/Gemini), throttle & webhook yüzeyi,
`packages/db` script'leri, ve `docs/{deploy*,launch-checklist,migration-safety,
rls-plan,r2-bucket-split}.md`.

Yöntem: 7 mercek paralel; **yedisi de teslim etti**. Ham bulgular
tekilleştirildi, HIGH adayları ana oturumda kod okunarak/çalıştırılarak
doğrulandı.

**Bu parça öncekilerden belirgin biçimde daha ağır çıktı** — beklenen bir sonuç:
altyapı ve operasyon bugüne kadar hiç denetlenmemişti; önceki 10 parça ürün
kodunu tarıyordu. Bulguların çoğu kod hatası değil **yapılandırma, dağıtım ve
operasyon boşluğu**; birkaçı ise ürün kodunda ama yalnız prod koşullarında
görünür hale geliyor.

## ⚠️ ÖNCE BU — canlı doğrulama gerektiriyor

**`RUN_SEED` prod'a sabit parolalı hesap açıyor.** Dört mercek bağımsız olarak
aynı sonuca vardı; zinciri uçtan uca doğruladım:

- `render.yaml:33-34` → `RUN_SEED: "true"` **sabit değer** (`sync: false` değil).
- `docker-entrypoint.sh:11-14` → bayrak `true` ise **her konteyner boot'unda**
  `seed` koşar (yalnız deploy'da değil; Render free uykudan uyanışta da).
- `seed.ts:90-104` → `ensureSuperAdmin()` (bunda prod parola kapısı **var**)
  ardından **koşulsuz** `ensureCompany(...)` ×3.
- `seed.ts:172` → `const password = "Demo1234!"`; firmalar `tier: GOLD`,
  `companyVerificationStatus: "VERIFIED"`, onboarding tamamlanmış, üçü
  birbirine ACTIVE bağlı.
- `seed.ts:50-53` → `ensureAuthUser` mevcut kullanıcıda
  `updateUserById(existing, { password })` çağırıyor → **parola elle
  değiştirilse bile her seed koşusunda `Demo1234!`'e geri döner.**
- Parola `CLAUDE.md`'nin "Test Hesapları" bloğunda repo içinde yazılı.
- `RUN_SEED` sonradan `false` yapılsa bile **bir kez koştuysa hesaplar kalır.**

Kod tarafındaki tek prod kapısı `ensureSuperAdmin`'in zayıf-parola reddi
(`admin12345` denylist'te) — demo firma kolunda **hiçbir `NODE_ENV` kontrolü
yok**. Dokümanlar da yanlış anlatıyor: `deploy-free.md:32` ve
`launch-checklist.md:152-164` `RUN_SEED`'i yalnız "admin tohumu" diye tarif
ediyor, demo firmalardan hiç söz etmiyor.

**Repodan doğrulanamayan:** Render'daki gerçek `RUN_SEED` değeri ve canlı DB'de
bu hesapların var olup olmadığı. Kontrol edilmesi gereken:
`firma@demo.com`, `firma2@demo.com`, `firma3@demo.com`.

## DOĞRULANAN — HIGH

Şiddet ölçütü: canlıda veri/erişim kaybı veya sessiz bozulma üreten, ya da bir
arızayı görünmez kılan maddeler.

### Gözlemlenebilirlik — "bozulduğunda kimse görmüyor"

| # | Bulgu | Kanıt |
|---|-------|-------|
| 1 | **`SentryGlobalFilter` elle atılan TÜM 5xx'leri atlıyor.** `@sentry/nestjs` `isExpectedError` = `'status' in exception \|\| 'error' in exception`; Nest'in `HttpException`'ı kurucusunda `this.status` yazıyor → **500'ler dahil her HttpException "beklenen" sayılıyor**. Kodda 18 elle atılan 5xx var (R2 yapılandırma/erişim, AI 502/503, "Dosya içeriği okunamadı"). *Kütüphane kaynağı okunarak doğrulandı.* | `app.module.ts:213`; `@sentry/nestjs/build/cjs/helpers.js:10-15` |
| 2 | **Cron hataları Pino'yu ve Sentry'yi tamamen atlıyor.** `@nestjs/schedule` `CronJob.from({...options, onTick})` çağırıyor — `errorHandler` **geçmiyor**; `cron@4` reddi kendi yakalayıp ham `console.error("[Cron] error in callback")` basıyor. `trackCronRun` hatayı rethrow ediyor ama cron zaten yakaladığı için `unhandledRejection` ağına da düşmüyor. Etkilenen: 12 işten 11'i. *Kütüphane kaynağı okunarak doğrulandı.* | `cron-registry.service.ts:62-74`; `@nestjs/schedule/dist/scheduler.orchestrator.js:56`; `cron@4.4.0/dist/job.js:134-147` |
| 3 | **`SENTRY_DSN` blueprint'te HİÇ YOK.** `render.yaml`'ın 40+ env anahtarı arasında geçmiyor. DSN yoksa `reportToSentry` ilk satırda `return` → kritik-audit kaybı, webhook misconfig, `unhandledRejection`, kritik e-posta hatası, AI-kapalı uyarısı — **hepsi sessiz**. Launch-checklist bunu "en tehlikeli tek nokta / tek fail-open servis" ilan ediyor ama dağıtım manifestine yansımamış | `render.yaml` (tam dosya); `instrument.ts:14,67` |
| 4 | **Alarm marker'larını okuyan hiçbir şey yok + Sentry gruplaması ikinci olayı susturuyor.** `[AUDIT-KRİTİK-KAYIP]`, `[EMAIL-KRİTİK-*]` sabit dizeyle `captureMessage` ediliyor → tek issue'da toplanıyor; varsayılan "yeni issue" kuralıyla **ilk olay e-posta üretir, sonrakiler üretmez**. Repo genelinde bu marker'ları tüketen script/konfig yok | `instrument.ts:70-78`; `audit.service.ts:101`; `email.service.ts:147,235` |

### Boot & dağıtım — "fail-closed sanılan kapılar artık kapatmıyor"

| # | Bulgu | Kanıt |
|---|-------|-------|
| 5 | **Boot guard'ları artık `exit 0` ile bitiyor — Parça 1'de EKLEDİĞİM ağın yan etkisi.** `process.on("unhandledRejection")` `bootstrap()` İÇİNDE ve guard'lardan ÖNCE kayıtlı; `bootstrap()` çağrısının `.catch`'i yok. Node'da bu handler kayıtlıyken varsayılan çökme davranışı devre dışı → `checkJwtSecret`, `assertProdWebUrl`, `assertProdConfigSanity`, R2 `HeadBucket`, `EmailService.getOrThrow` **hepsi yutuluyor**, süreç başarı koduyla bitiyor. İki mercek bağımsız buldu, biri ampirik repro yaptı | `main.ts:49-55` (handler), `:65-114` (guard'lar), `:253` (`bootstrap();`) |
| 6 | **R2 kesintisi API'yi boot ettirmiyor, üstelik SÜRESİZ asabiliyor.** `onModuleInit` her bucket'a `HeadBucket` + CORS çağrısı yapıyor ve hata → throw. S3Client'a `requestTimeout`/`connectionTimeout` verilmemiş; smithy varsayılanı **0 = kapalı**. Asılı kalırsa `app.listen()` hiç dönmez → port açılmaz → deploy süresiz "in progress", logda tek hata satırı yok. Oysa R2 çekirdek akışların çoğunda gerekli değil (presigned imza yerel) | `storage.service.ts:110-135`; `@smithy/node-http-handler` varsayılanları |
| 7 | **Migration prod'a boot'ta, insan onayı ve snapshot'sız uygulanıyor; başarısızlık self-heal etmiyor ve break-glass runbook'u YOK.** `set -e` + `migrate deploy` entrypoint'te, `autoDeploy: true` ile main'e her push'ta. `migration-safety.md`'nin "her `migrate deploy` ÖNCESİ snapshot al" kuralının uygulanabileceği bir "önce" anı yok. Prisma yarıda kalan migration'ı `failed` işaretler ve sonraki denemeleri `migrate resolve` yapılana kadar reddeder → **crash loop**; bu komut deploy dokümanlarının hiçbirinde geçmiyor | `docker-entrypoint.sh:4-7`; `render.yaml:15`; `docs/migration-safety.md:24-34` |
| 8 | **CI ön yüzü hiç build etmiyor, 72 ön yüz testini hiç koşmuyor, lint ve şema-drift kapısı yok.** CI'nın tamamı: `pnpm typecheck` + `pnpm --filter @rothern/api test`. Koşmayanlar: web (57 dosya) + admin (15 dosya) vitest, `next build` ×2, `pnpm lint`, `prisma migrate diff --exit-code`, gitleaks. Ayrıca CI **deploy'u gate etmiyor** — Render/Vercel aynı push'ta paralel deploy ediyor, CI seyirci | `.github/workflows/test.yml`; `render.yaml:15` |

### Dış servisler — "askıda kalıyor, sessizce kayboluyor"

| # | Bulgu | Kanıt |
|---|-------|-------|
| 9 | **Resend ve Supabase Auth çağrılarında timeout YOK.** İki SDK'ya da özel `fetch`/`AbortSignal` verilmiyor; tek tavan undici `headersTimeout` ≈ **300 sn**. Kayıt akışı `issueEmailCode`'u `await` ettiği için Resend asılı kalırsa istek 5 dakika tutulur | `packages/email/src/providers/resend.ts:19-45`; `supabase-auth.service.ts:36-46` |
| 10 | **E-posta gönderiminde ne retry ne hız sınırı var; toplu davetler sessizce FAILED oluyor.** `ResendProvider.send` hatada doğrudan throw; FAILED kayıtlarını yeniden deneyen cron/kuyruk yok (tek yol admin'in elle "Yeniden Gönder"i). 200 davetli bir ihalede hepsi aynı anda gönderiliyor → sağlayıcı hız sınırına takılanlar kalıcı FAILED. `listing_invitation` kritik-bağlam listesinde olmadığı için **Sentry alarmı da yok** | `resend.ts:38-44`; `email.service.ts:191-241`; `company-listings.service.ts:707-717` |
| 11 | **Prod şablonu `connection_limit=1` öneriyor + e-posta fan-out'u sınırsız → havuz açlığı.** `.env.example:11`, `.env.production.example:12`, `deploy-free.md:18` üçü de prod `DATABASE_URL` için tek bağlantı öneriyor. `notify()` `void email.send()` ile N davetliye eşzamanlı gönderim başlatıyor; her gönderim 4 Prisma round-trip yapıyor. 200 davetli ≈ 800 sorgu tek bağlantıda serileşir → o instance'taki **her kullanıcı isteği** `pool_timeout` ile 500 alır. *(Not: `connection_limit=1` kararı test DB'si içindi — `test-db.ts` deadlock çözümü; prod şablonuna sızmış.)* | yukarıdaki üç dosya; `email.service.ts:104-190` |

### Veri yaşam döngüsü — "silmiyoruz, saklamıyoruz, geri dönemiyoruz"

| # | Bulgu | Kanıt |
|---|-------|-------|
| 12 | **KVKK saklama cron'ları (04:00/04:10 TR) uykuda kaçıyor, telafi yok.** `membership.scheduler` boot catch-up'ı **bilinçli** taşıyor ve yorumu tam bu arızayı anlatıyor ("sabit-saatli cron uyku/restart'ta KAÇAR"); aynı desen AI temizlik (24h `ai-extract/` + 90 gün sohbet) ve `approvals.remind` (09:00) için uygulanmamış. Render free gece uyuduğu için 24 saatlik TTL ve 90 günlük silme **prod'da hiç çalışmıyor olabilir** | `ai.scheduler.ts:66,95`; `approvals.scheduler.ts:41` vs `membership.scheduler.ts:26-42` |
| 13 | **R2 object-lock/versioning ile `deleteObject` gerçek imha değil → KVKK silme talebi karşılanmıyor.** Profil servisi yorumu object-lock'un ikinci yazımı 409'ladığını **canlıda doğrulanmış** olarak kaydediyor; `purgeCompanyObjects` silinemeyen nesneyi yalnız `logger.warn` ile geçiyor (Sentry'ye bile gitmiyor). `deleteObject` `VersionId` taşımıyor → versiyonlu bucket'ta yalnız delete marker koyar. Sistem "temizlendi" der, KYC kimlik taramaları durur | `company-profile.service.ts:92-96`; `admin-companies.service.ts` purge; `storage.service.ts:405-412` |
| 14 | **`email_events` sınırsız büyüyor ve ham payload'da alıcı IP + user-agent tutuyor.** Her webhook olayı (her AÇILIŞ dahil) tam gövdesiyle saklanıyor; `data.click.ipAddress`, `data.click.userAgent`, `data.to` → KVKK verisi. Hiçbir temizlik işi bu tabloya dokunmuyor. 1000 firma/1 yıl tahmini **~2,6M satır / 4-6 GB** | `resend-event.service.ts:12-31,88-98` |
| 15 | **Yedekleme fiilen yok sayılmalı.** `launch-checklist`'in PITR maddelerinin **dördü de işaretsiz** (Pro, PITR eklentisi, retention ≥30 gün, **restore tatbikatı**); `migration-safety`'nin "PITR aktif teyit et" maddesi de işaretsiz. Deploy dokümanlarında "backup/restore/snapshot" kelimeleri hiç geçmiyor. RTO/RPO tanımlı değil. Checklist'in kendi kırmızı çizgisi: *"Bu yapılmadan 'backup'ım var' denmez"* | `docs/launch-checklist.md:52-59`; `docs/migration-safety.md:31-34` |

### Kötüye kullanım yüzeyi

| # | Bulgu | Kanıt |
|---|-------|-------|
| 16 | **`cf-connecting-ip` koşulsuz güveniliyor → tüm IP-bazlı limitler saldırganın seçtiği anahtarla çalışıyor.** `resolveClientIp` yalnız `isIP()` biçim kontrolü yapıyor; ne CF egress aralığı, ne `cf-ray` şartı, ne XFF çapraz kontrolü. Aynı değer hem throttle kovası hem audit IP'si. Origin'e CF'i atlayarak ulaşan her yol için login 10/dk, forgot-password 5/dk, dış davet 3/dk, AI 100/dk **hepsi sıfırlanır** ve audit'e sahte IP yazılır. *Parça 1'de bu tasarım bilinçli seçilmişti; bu bulgu kararı değil, doğrulanmamış varsayımı işaretliyor* | `client-ip.ts:29-38`; `client-ip-throttler.guard.ts:13-15`; `render.yaml:30-31` |
| 17 | **`fallbackInactiveApprovers` tıkalı onay zincirini onaramıyor.** Sorgu yalnız duruma bakıyor, onaycının pasifliğine bakmıyor; `take: 100` **süzmeden ÖNCE** uygulanıyor ve `orderBy` yok. 100'den fazla bekleyen adım olduğunda pencere dışındaki tıkalı zincir hiç onarılmaz → ihale yayınlanamaz/kazandırılamaz halde asılı kalır. **Parça 8 Dalga B'de LOW olarak kayıtlı; ölçekte HIGH'a dönüşüyor** | `company-approvals.service.ts:1127-1144` |

## DOĞRULANAN — MED (özet)

**Dağıtım/env:** `render.yaml`'da `COOKIE_SAMESITE` yok → blueprint'i harfiyen
uygulayan kurulum **boot edemez** (guard doğru çalışıyor, blueprint yanlış
yönlendiriyor); `COOKIE_DOMAIN` yorumu ("boş bırak") guard'la çelişiyor;
`TOTP_ENC_KEY` blueprint'te yok → `JWT_SECRET` rotasyonu **tüm 2FA'yı sessizce
bozar** (kaynak dosya bu tuzağı yorumda anlatıyor, checklist'te yok);
`JWT_EXPIRES_IN=1h` ile CLAUDE.md'nin "prod 7d" ifadesi çelişiyor (ürün kararı);
Vercel `--no-frozen-lockfile` ile kuruluyor — CI'nın doğruladığı ağaç ile prod'a
çıkan ağaç aynı olmayabilir; `ANTHROPIC_API_KEY` ikinci fail-open ve `AiService`
bütçe kapısını **atlıyor**; `ADMIN_URL`/`API_URL` ölü env; kök `engines: ">=20"`
ile Dockerfile'ın "≥22.18 ZORUNLU" notu çelişiyor; API imajı tek aşamalı ve root.

**Kötüye kullanım:** Resend webhook'unda `@SkipThrottle()` argümansız → yalnız
`default`'u atlıyor, efektif tavan **1000/dk/IP**; imzadan ÖNCE 5MB gövde
tamponlanıyor ve her başarısız imza bir Sentry olayı üretiyor (kota tüketimi);
AI uçlarında route throttle yok ve **ağır dosya indirme/çözme bütçe
rezervasyonundan ÖNCE** koşuyor (P6'da kapatılan OOM'un kardeşi: tek istek
sınırlı, eşzamanlılık sınırsız); `forgot-password`'da adres-bazlı cooldown yok
(mail-bomb); dış davet günlük tavanı TOCTOU (aynı sınıf `profile-enrich`'te
bilinçle düzeltilmiş, bu çağrı yeri atlanmış); presigned PUT'ta
`content-length-range` yok ve commit edilmeyen nesneler (AI dışı) hiç
temizlenmiyor; login/TOTP'de hesap-bazlı deneme sayacı yok (e-posta kodunda
var — desen biliniyor); SSRF kapısı yalnız host **dizgisine** bakıyor (ondalık/
onaltılık IP, IPv4-eşlemeli IPv6, DNS çözümlemesi yok);
`.env.production.example` `THROTTLE_AUTH_LIMIT=10`'u "varsayılan" diye
öneriyor — uygulanırsa **tüm API 10 istek/dk/IP** olur (kendi kendine DoS).

**Cron:** `evaluationValidityReminders` `take:200` penceresi damgalanmayan
adaylarla tıkanıyor; `approvals.remind` (09:00) uykuda kaçıyor, telafi yok;
kapanış hatırlatması uykuda **kalıcı kayıp** (aday filtresi `closesAt > now`);
`fallbackInactiveApprovers` atomik claim ve per-kayıt hata izolasyonu taşımayan
tek iş; vade hatırlatma e-postasındaki tarih **sunucu TZ'sinde** (UTC)
biçimleniyor → UI ile 1 gün fark.

**Dayanıklılık:** Kapatma yolu ikiye bölünmüş (iki SIGTERM dinleyicisi, drain'den
önce destroy, sınırsız drain); admin duyurusunda chunk'lama e-posta kolunda
etkisiz (5000 eşzamanlı gönderim); Excel içe aktarmada zip **açılım-boyutu**
sınırı yok (sıkıştırılmış boyut kontrol ediliyor); dış site indirmede gövde
tamamen belleğe alınıyor (chunked yanıt kapıyı atlıyor); TCMB çekiminde retry
yok — tek ağ hıçkırığı bir iş günü kur kaybettiriyor; `/api/health` DB down
iken de **200** dönüyor → Render restart tetiklemiyor, deploy paneli yeşil
görünürken her istek 500.

**Veri:** KVKK silme `audit_logs`/`email_logs`/`email_events`'e hiç dokunmuyor
ve "10 yıl sonra silinir" beyanının teknik karşılığı yok; silinen ilanın ve
terk edilmiş presign'ların R2 nesneleri öksüz kalıyor (**hiçbir bucket lifecycle
kuralı yok** — kodda tek `PutBucketLifecycleConfiguration` çağrısı yok);
`seed-categories` prod DB'ye koşabilir ve kategori tablosunu saniyelerce **boş
bırakır** (ortam kontrolü yok, `packages/db/.env` prod'a symlink);
`notifications` sınırsız (okunmuşlar hiç silinmiyor); RLS planı bayat —
checklist'in "ilk engel" dediği `CREATE ROLE` adımı entrypoint sayesinde **zaten
uygulanmış**, kalan tek gerçek bilinmeyen pooler'ın custom-rol auth'u.

**Sürüm:** Zero-downtime yok ve expand-contract uygulanmıyor → **"önceki deploy'a
dön" düğmesi migration'lı sürümlerde güvenli değil** (şema geri gelmez, tek
çıkış PITR) ve bunu söyleyen bir uyarı hiçbir dokümanda yok; ön yüz ↔ API sürüm
eşzamanlılığı yönetilmiyor (aynı push, üç bağımsız deploy); `NEXT_PUBLIC_*`
değişince zorunlu redeploy adımı hiçbir runbook'ta yok; doküman-yalnız commit
CI'yı atlıyor ama Render deploy'unu atlamıyor.

**Doküman driftleri:** `.env.production.example` hâlâ var olmayan
`app.rothern.com`'u öğütlüyor (Parça 1'de kaydedilmiş, düzeltilmemiş —
`assertProdWebUrl` yalnız boş/localhost'u yakalar, yanlış-ama-geçerli domaini
kabul eder); `deploy.md:26` `app` DNS kaydı istiyor; `launch-checklist` private
bucket adını `supkeys-documents` diyor (gerçeği `rothern-prod`) — bu, KYC
belgelerinin imzasız ifşasını önleyen tek operasyonel kural; ölü
`NEXT_PUBLIC_SUPABASE_*` iki Dockerfile + compose + üç dokümanda yaşıyor;
**CLAUDE.md'de `_journal.json` talimatı yanlış** (Prisma'da böyle bir dosya yok,
o Drizzle kavramı; Prisma `_prisma_migrations` tablosunu kullanır);
`cleanup-pending-relations` script'i CLAUDE.md'de yazılı ama artık yok.

## ÇÜRÜTÜLEN / DARALTILAN

- **"`COOKIE_SAMESITE` boşsa CsrfGuard komple bypass"** (launch-checklist'in
  kendi ifadesi) → **prod'da ULAŞILAMAZ**: `assertProdConfigSanity` bu
  kombinasyonu boot'ta reddediyor, uygulama ayağa kalkmıyor. Checklist'in 93.
  satırı bayat; 126-128. satırları doğruyu söylüyor. (Yalnız `NODE_ENV`
  "production" değilse guard inert — LOW.)
- **Fire-and-forget promise taraması** → **TEMİZ**: 53 `void …` çağrısının
  tamamı iç-guard'lı; `console.*` kalıntısı yok. Bu alanda kök sorun "yutulan
  hata" değil, "hata görülüyor ama kimseye ulaşmıyor" (bkz. HIGH #1-#4).
- **Çoklu örnek güvenliği** → 12 cron işinin **11'i** atomik claim taşıyor;
  ölçeklenmede kırılan tek şey `fallbackInactiveApprovers` (çift devir + çift
  bildirim), çift sipariş/çift durum geçişi DEĞİL.
- **Sır geçmişi** → **TEMİZ**: tam geçmiş gitleaks taraması (1186 commit / 17 MB)
  "no leaks found"; takipli env dosyalarının üçü de fixture.
- **helmet/CORS duruşu** → istenen sıkılıkta (API CSP `default-src 'none'`,
  joker yok, urlencoded parser bilinçle kaldırılmış).
- **Zip-bomb koruması** → xlsx okuyan **üç yerin üçü de** korumalı; sharp
  60 MP tavanı yerinde. (Açılım-boyutu sınırı ayrı bir MED.)
- **AI USD bütçesi** → ön-rezervasyon + FOR UPDATE + tavanlar yapısal olarak
  sağlam; sorun bütçenin **CPU/egress'i** sınırlamaması.
- **Puppeteer eşzamanlılık riski** → API'de puppeteer bağımlılığı **yok**.
- **`.env.test` sırları** → gerçek sır değil (lokal docker + test fixture).

## DALGA B (LOW/INFO)

Cron registry'nin süreç-ömürlü olması ve "koşmadı" alarmı olmaması; redaction
listesindeki ölü yollar + `req.query` maskeleme boşluğu; `LOG_LEVEL=info`'nun üç
teşhis satırını düşürmesi; AI sağlayıcı fallback'inin yalnız `warn` olması;
`closeExpired`'de tavan yokluğu; boot kur seed'inin registry dışı olması;
`remindPending`'de damgalanmayan anomali kaydı; `ApprovalRequestStep`'te
`[status]` indeksi eksikliği; `FALLBACK_RATES`'in snapshot'a damgalanabilmesi;
eslint `no-floating-promises` kapalı; boot seed timer'ının teardown'da
temizlenmemesi; `/health`'in kimliksiz ve throttle'sız olması;
`categories/all`'ın sunucu-cache'siz olması; kimliksiz kategori uçlarında
parametre tavanı yokluğu; `email_verification_codes`/kullanılmış
`password_reset_tokens` temizliği; `ai-extract/` anahtarlarının env öneki
taşımaması; coverage'ın fiilen hiç ölçülmemesi.

## DURUM

- Dalga A **UYGULANMADI** — düzeltme ONAYI bekliyor; ayrıca **#RUN_SEED için
  canlı doğrulama** gerekiyor (repo bunu gösteremez).
- Önerilen sıra: **RUN_SEED** (canlı kontrol + kod kapısı + `sync:false`) →
  **#5** (`bootstrap().catch` → exit 1; tek satır, tüm boot guard'larının
  değerini geri verir) → **#3** (`SENTRY_DSN` blueprint'e; diğer tüm alarm
  bulgularının ön koşulu) → **#1, #2** (5xx ve cron'u Sentry'ye bağla) →
  **#9, #10, #11** (timeout + fan-out + havuz) → **#8** (CI kapsamı) →
  **#7, #15** (migration/geri dönüş prosedürü) → **#16** (canlı
  `cf-connecting-ip` testi) → **#12-#14** (saklama/imha) → **#17**.
- Parça 9'dan devreden **B12** (audit_logs DB seviyesinde append-only) hâlâ
  karar bekliyor ve bu parçanın #14'üyle (saklama politikası) birlikte
  değerlendirilmeli.
