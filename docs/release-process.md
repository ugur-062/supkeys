# Sürüm süreci — staging → production (2026-09-11)

## Ortamlar

| Katman | Staging | Production |
|---|---|---|
| Git dalı | `main` | `production` |
| API | Render `api-staging` (Free) → `api.staging.supkeys.com` | Render `api` (Starter) → `api.rothern.com` |
| Web / Admin | Vercel Preview (`main`) → `staging.supkeys.com`, `admin.staging.supkeys.com` | Vercel Production (`production`) → `www.rothern.com`, `admin.rothern.com` |
| Veritabanı + Auth | Supabase `rothern-staging` (Pro, aynı kuruluş) | Supabase canlı (Pro) |
| Dosya | R2 `rothern-staging` → `cdn.staging.supkeys.com` | R2 canlı → `cdn.rothern.com` |
| E-posta | Resend, `staging@supkeys.com` (ayrı gönderen alan adı) | Resend, canlı gönderen |
| Çerez alanı | `.staging.supkeys.com` (ayrı kayıtlı alan adı — canlı çerezleri gelmez) | `.rothern.com` |

> **STAGING DA PRO'DA KALIR (2026-09-16, kullanıcı kararı "bir daha taşıttırma").**
> Supabase planı KURULUŞ başınadır; canlı Pro'ya geçince aynı kuruluştaki
> staging de Pro oldu. İkinci projenin ek işlem ücreti küçük bulundu; ücretsiz
> ayrı kuruluşa taşıma ÖNERİLMEYECEK. Yan fayda: staging kullanılmadığında
> duraklatılmıyor (gece e2e koşumu kesilmez).

Yerel geliştirme (`.env`) **staging**'e bağlıdır. Canlı değerler `.env.prod.local`'da
(gitignore'lu) yalnız onaylı migration için kullanılır.

## Akış

1. Dal aç → kod → yerel testler.
2. PR → `main`: GitHub Actions (`test.yml`) API + web + admin suite'leri, typecheck,
   lint, şema drift kapısı ve build koşar. Kırmızıysa birleşmez.
3. `main`'e birleşince Render `api-staging` ve Vercel Preview kendiliğinden kurar;
   migration staging'de konteyner açılışında (`docker-entrypoint.sh`) uygulanır.
4. Staging'de doğrulama: rol hesaplarıyla manuel tur (`seed-staging-roles`) ve
   Playwright akışları.
5. Canlıya çıkış: `main` → `production` birleştirme (PR). Migration varsa ÖNCE
   canlıya koşulur:
   `DATABASE_URL=<prod> DIRECT_URL=<prod> ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy`
   (`.env.prod.local` değerleriyle; nöbetçi uzak hedefi açıkça onaylatır).
   API'ye parametre ekleyen değişiklikte API önce.
6. Geri alma: Render / Vercel'de önceki dağıtıma dön. Migration'lar yalnız
   EKLEYİCİ (kolon silme sonraki sürüme) — `docs/migration-safety.md`.

## Kurallar

- `production` dalına doğrudan push YOK; yalnız `main`'den PR (GitHub branch
  protection: "Test (api + typecheck)" zorunlu, güncel dal şartı).
- Canlıya çıkmadan önce Supabase yedeğinin son 24 saat içinde alındığını doğrula.
- Riskli özellik anahtarla (`MARKETPLACE_LIVE` kalıbı): kod çıkar, anahtar staging'de
  doğrulanınca açılır.
- Haftada bir toplu sürüm; acil düzeltme aynı akıştan, beklemeden.

## Staging verisi

- Rol hesapları: `pnpm --filter @rothern/db seed-staging-roles`
  (`uguray156+qa-<slug>@gmail.com`; parola `STAGING_QA_PASSWORD` ya da varsayılan).
  Hesaplar: alıcı GOLD/doğrulanmış (kurucu, yönetici, satın almacı, satışçı,
  onaylayıcı, görüntüleyici) · tedarikçi SILVER/doğrulanmış (kurucu, satışçı,
  görüntüleyici) · ücretsiz STANDART/doğrulanmamış (kurucu). Alıcı ↔ tedarikçi bağlı.
- Kategori kataloğu: `seed-categories` → `apply-category-translations` →
  `apply-category-keywords` → `seed-category-attributes` (CLAUDE.md sırası).
- Demo vitrin: `seed-marketplace-demo`.
- Canlıdan veri KOPYALANMAZ (KVKK).

## Render api-staging ortamı

Değişken listesi `render.yaml` ile aynı; staging'e özel değerler gitignore'lu
`render.staging.env` dosyasında (repo kökü, yalnız yerel). Sırlar yenilenince
Render'da elle güncellenir.

**E-posta alıcı izin listesi (2026-10-05, sahip kararı).** Staging'in e2e ve
zamanlayıcı e-postaları sahibin Gmail artı adreslerine günde yüzlerce test
e-postası yolluyordu; Gmail bunları toplu posta saydı ve Rothern'i
Promosyonlar'a atmaya başladı. `api-staging`de `EMAIL_ALLOWLIST` DOLU olmalı,
canlıda BOŞ (boş = kapı yok, davranış birebir aynı):

```
EMAIL_ALLOWLIST=uguray156@gmail.com,uguray156+qa-kayit-*@gmail.com,uguray156+qa-ae-*@gmail.com
```

- Sözdizimi: virgülle ayrılmış (boşluk/satır sonu da ayraç); büyük/küçük harf
  önemsiz. Tam adres artı adresi dahil BİREBİR eşleşir (`uguray156@gmail.com`
  girdisi `uguray156+x@gmail.com`u kapsamaz). `*` yerel kısımda ya da alan
  adında `@`'yi aşmayan herhangi bir diziye (boş dahil) eşleşir:
  `*@firma.com`, `uguray156+qa-kayit-*@gmail.com`. Her girdide tek `@`
  olmalı; geçersiz girdi yok sayılır (açılışta uyarı). Değer dolu ama hiç
  geçerli girdi yoksa — yalnız ayraçtan oluşan `,` / ` ; ` dahil — HİÇBİR
  e-posta gitmez (yanlış ya da yarım yazım staging'i herkese göndermeye
  döndürmesin). Kapıyı kaldırmak için değişkeni SİLİN; geçici "herkese
  gönder" gerekirse `*@*`.
- Davet ekranları (ekip daveti, "tedarikçini davet et") listede olmayan
  adres için "bu ortamda yalnız izin listesindeki adreslere e-posta gidiyor"
  der (`allowlist` alt nedeni) — "adres kalıcı geri çevirdi" değil; kayıt
  durumu/iptal davranışı yine `SUPPRESSED`.
- Listede olmayan alıcı: e-posta çizilir, `email_logs` satırı konu + payload
  ile yazılır (`staging-email-content` içeriği buradan okur), `FAILED` +
  `suppressed: allowlist: recipient not on EMAIL_ALLOWLIST`, `sent:false`;
  yeniden deneme ve Sentry alarmı yok. Uygulama içi bildirimler etkilenmez.
- Öneri neden bu üçü: ana kutu (admin girişi `uguray156@gmail.com`) + kayıt
  e2e'lerinin adresleri (`qa-kayit-*`, `qa-ae-*`; kod veritabanından okunur,
  ama ekranda "kod gönderilemedi" uyarısı çıkmasın). Rol hesaplarına
  (`uguray156+qa-<rol>`) giden yüzlerce bildirim artık gitmez. Elle gezintide
  demo hesap e-postalarını görmek için `,uguray156+demo-*@gmail.com` eklenebilir.
- Açılış günlüğü: `Recipient allowlist active (EMAIL_ALLOWLIST): N entries`
  (girdiler yazılmaz).
- Ayrı adım: staging kendi gönderen alt alan adına taşınmalı (Resend'de
  `mail.supkeys.com` doğrulanır → `EMAIL_FROM_ADDRESS=staging@mail.supkeys.com`);
  açılış kapısı WEB_URL alan adının alt alan adlarını kabul eder. Operatör
  eylemleri `docs/qa-launch-audit-2026-09-28.md` O-71/O-72.


**Doğrulanmamış kayıt temizliği anahtarı (2026-10-08).** E-postası 7 gündür
doğrulanmamış kayıt silinir: gece 05:10 işi (`signup.purgeUnverified`, gecede en
fazla 500 kayıt; fazlası ertesi geceye kalır ve günlüğe
`… stopped at the cap of 500 removals per run …` yazılır) ve kayıt / ekip daveti
anında adresin serbest bırakılması. İkisi de TEK anahtara bağlıdır:

| `UNVERIFIED_SIGNUP_PURGE_ENABLED` | Sonuç |
|---|---|
| `true` | AÇIK (ortam ne olursa olsun) |
| `false` | KAPALI (ortam ne olursa olsun) |
| tanımsız / boş | yalnız `NODE_ENV=production` iken AÇIK; diğer her yerde KAPALI |
| başka bir değer (`1`, `TRUE`, `off`…) | KAPALI + açılışta uyarı |

- `api` (canlı) ve `api-staging` production kipinde koştuğu için ikisinde de
  **değişken TANIMLANMAZ**; iş kendiliğinden açıktır. Yerel geliştirme, testler
  ve betikler kapalıdır.
- **Acil durdurma:** Render panelinde `UNVERIFIED_SIGNUP_PURGE_ENABLED=false`
  (deploy gerekmez). Kapalıyken gece işi hiçbir şey yapmaz ve Sistem sayfasında
  "hiç koşmadı" görünür; tutulan adrese kayıt / ekip daveti eskisi gibi 409 alır.
- Açılış günlüğü durumu bir kez yazar: `Unverified sign-up purge is ON (…)` ya
  da `… is OFF (…)`; production kipinde kapalıysa satır uyarı düzeyindedir.
- **Veritabanı KOPYASI** (yedekten dönüş provası, staging dökümüyle kurulan
  yerel ortam) kaynağının auth projesine bağlanıyorsa `false` ZORUNLU: silme
  auth sağlayıcısındaki kullanıcıyı da kalıcı siler ve kararı kopyanın bayat
  satırlarına göre verir (`docs/backup-restore-drill.md` "Bilinen tuzaklar").
- İlk gece birikmiş kayıtların en fazla 500'ü silinir; her silme denetim
  kaydına `company.signup_expired` olarak düşer.

**AI sağlayıcı hatası teşhisi (2026-10-07).** Sağlayıcı bir çağrıyı reddettiğinde
(kullanıcıya 502 `api.ai.saglayiciHataDondurdu`) `ai_usage` satırı `FAILED` +
`errorCode='provider_error'` olur ve Google'ın yanıtından TEMİZLENMİŞ sebep kodu
`metadata.providerReason` alanına yazılır (yalnız HTTP durumu, Google hata durumu
ve sabit ipuçları; serbest metin/sır yok — `ai-provider-reason.ts`). Aynı kod
Render günlüğündeki `AI sağlayıcı hatası (provider_error, <kod>)` satırında da
görünür. Sorgu:

```sql
SELECT "createdAt", feature, model, metadata->>'providerReason' AS sebep
FROM ai_usage WHERE status = 'FAILED' AND "errorCode" = 'provider_error'
ORDER BY "createdAt" DESC LIMIT 20;
```

| Sebep kodu | Anlamı | Yapılacak |
|---|---|---|
| `http_400:FAILED_PRECONDITION:location_not_supported` | AI Studio (API anahtarı kipi) Render veri merkezi IP'sini reddediyor | `GEMINI_SERVICE_ACCOUNT_JSON` + `GEMINI_VERTEX_PROJECT` / `GEMINI_VERTEX_LOCATION` girin (Vertex kipi) |
| `http_400:INVALID_ARGUMENT:API_KEY_INVALID` | `GEMINI_API_KEY` geçersiz/silinmiş | Anahtarı yenileyin |
| `http_403:PERMISSION_DENIED…` (`SERVICE_DISABLED`, `api_disabled`, `billing`) | Vertex AI API kapalı, `roles/aiplatform.user` eksik ya da faturalama kapalı | Google Cloud projesini düzeltin |
| `http_404:NOT_FOUND:model_not_found` | `AI_MODEL_*` adı bu kipte tanınmıyor | Model adlarını düzeltin |
| `oauth_invalid_grant` | Service account anahtarı silinmiş/bozuk | Yeni anahtar üretip `GEMINI_SERVICE_ACCOUNT_JSON`u güncelleyin |
| `http_429…` / `http_503…` | Kota / kapasite | Geçici; sürerse kotayı yükseltin |

Staging'de (2026-10-05 ölçümü) her AI çağrısı 1 saniyenin altında 502 dönüyordu:
Google isteği doğrudan reddediyor. Render `api-staging`de sırayla
`GEMINI_SERVICE_ACCOUNT_JSON`, `GEMINI_API_KEY`, `GEMINI_VERTEX_PROJECT` /
`GEMINI_VERTEX_LOCATION` ve `AI_MODEL_*` kontrol edilmeli.

## Operatör: soğuk davet e-postalarının gelen kutusuna düşmesi (2026-10-09)

Sahip kararı: AI'ın bulduğu, hiç kayıt olmamış firmalara giden davet
Promosyonlar'a ya da spam'e düşmemeli. Gelen kutusu yerleşimini kimse garanti
edemez; amaç bizim tarafımızdaki her nedeni kaldırmak. **Kodun yaptığı:** talep
daveti, hatırlatması, özeti ve "katıl" daveti düz mektup olarak gider (görsel,
ek, kart, düğme, gizli önizleme metni yok; en fazla dört bağlantı, hepsi
`WEB_URL` alan adında; HTML 2-4 KB, beş talepli özette en çok ~6 KB; düz metin
parçası aynı içerik),
`List-Unsubscribe` + `List-Unsubscribe-Post` ve `Feedback-ID` taşır
(sözleşme: `cold-invite-plain-letter.spec`, `cold-invite-delivery.spec`).
**Aşağıdakileri yalnız operatör yapabilir** ve kodun yaptığından daha çok
belirleyicidir; önem sırasıyla:

1. **SPF + DKIM (gönderen alan adı).** Resend → Domains → alan adı "Verified"
   olmalı: `resend._domainkey.<alan adı>` (DKIM, TXT) ve `send.<alan adı>`
   (dönüş yolu: MX + SPF TXT) Cloudflare'de girili. Kanıt: Gmail'de gelen bir
   davette "Orijinali göster" → `SPF: PASS`, `DKIM: PASS` (`d=` bizim alan
   adımız), `DMARC: PASS`. Biri eksikse başka hiçbir önlem işe yaramaz.
2. **DMARC.** `_dmarc.rothern.com` TXT en az
   `v=DMARC1; p=none; rua=mailto:<rapor kutusu>` (Gmail/Yahoo toplu gönderici
   kuralı DMARC kaydı ister). `rua` raporlarında meşru kaynakların (Resend,
   Google Workspace) hepsi hizalı geçince `p=quarantine`, sonra `p=reject`
   (qa-launch-audit O-83). Erken sıkılaştırma meşru postayı karantinaya düşürür.
3. **Açılma ve tıklama izleme KAPALI.** Resend → Domains → alan adı →
   "Open Tracking" ve "Click Tracking" ikisi de kapalı (O-82). Açılma izleme
   görselsiz mektuba 1×1 izleme görseli ekler; tıklama izleme her bağlantıyı
   sağlayıcının yönlendirme adresine çevirir (bağlantı artık kendi alan adımızda
   değildir). İkisi de sağlayıcıda, bizim isteğimizden SONRA uygulanır: testler
   göremez. Ayar ALAN ADI başınadır — yeni bir gönderen alt alan adı eklenince
   orada da kapatılır. Kanıt: "Orijinali göster"de `<img` yok, bağlantılar
   doğrudan `https://www.rothern.com/…`.
4. **Yanıt adresi gerçek bir kutu.** `EMAIL_REPLY_TO=destek@rothern.com` dolu
   ve okunan bir kutu olmalı (O-67). Davet "Firma (Rothern üzerinden)" adıyla
   gider; alıcının yanıtı geri dönerse (kutu yoksa) itibar düşer, yanıt alan
   gönderen ise yükselir.
5. **İsteğe bağlı: INVITE akışı için ayrı gönderen alt alan adı.** Bugün bütün
   akışlar doğrulanmış `rothern.com`dan çıkar (`davet@rothern.com`); adresin
   yerel kısmını değiştirmek itibarı AYIRMAZ (itibar DKIM alan adına bağlı).
   Soğuk davetin şikâyetleri kod / şifre e-postalarını etkilemesin isteniyorsa:
   Resend'e alt alan adı eklenir (ör. `davet.rothern.com`) → DKIM + `send.`
   kayıtları Cloudflare'e girilir → "Verified" beklenir → o alan adında da
   izleme kapatılır (madde 3) → ANCAK ondan sonra Render `api` ortamında
   `EMAIL_FROM_ADDRESS_INVITE=davet@davet.rothern.com` tanımlanır (açılış kapısı
   `WEB_URL` alan adının alt alan adlarını kabul eder; ters sırada o akışın
   bütün gönderimleri reddedilir). Bedeli: yeni alt alan adının itibarı sıfırdan
   başlar — platform günlük tavanı (`COLD_INVITE_BASE_DAILY`=150, sorunsuz her
   hafta ×2) ısınma görevi görür, ilk haftalarda elle toplu davet yapılmaz.
   Değişken boşsa davet `EMAIL_FROM_ADDRESS`ten çıkar.
6. **Google Postmaster Tools.** postmaster.google.com'da `rothern.com` (ve
   varsa davet alt alan adı) DNS TXT ile doğrulanır (O-81; Yandex ve Mail.ru
   panelleri aynı madde). Haftalık bakılır: spam oranı %0,1'in altında kalmalı
   (%0,3 ve üstü yerleşimi bozar), alan adı itibarı, SPF/DKIM/DMARC geçiş
   oranı. Şikâyetler `Feedback-ID` tanımlayıcısına göre kırılır
   (`tender_external_invite:INVITE:prod:rothern`, `referral_invite:INVITE:…`):
   hangi e-posta türünün şikâyet aldığı buradan okunur. Veri yalnız yeterli
   Gmail hacminde görünür.

Her dağıtımdan ya da DNS / sağlayıcı ayarı değişikliğinden sonra tek kanıt
adımı: kendi Gmail adresinize bir talep daveti gönderin, "Orijinali göster"de
1 ve 3'teki satırları, `Reply-To`, `List-Unsubscribe` ve `Feedback-ID`
başlıklarını ve iletinin hangi sekmeye düştüğünü not edin. Staging'de
`EMAIL_ALLOWLIST` dolu olduğundan (yukarıda) deneme adresi listede olmalı.

## Gecelik e2e için GitHub sırları (2026-09-12)

`.github/workflows/e2e-staging.yml` her gece 04:00'te staging'e karşı koşar ve
gecelik koşumda Safari motorunu da ekler. Depo → Settings → Secrets and
variables → Actions altına şunlar girilmeli (hepsi `.env.staging` ve
`render.staging.env` içinde zaten var):

| Sır | Kaynak |
|---|---|
| `STAGING_VERCEL_BYPASS_WEB` | `.env.staging` |
| `STAGING_VERCEL_BYPASS_ADMIN` | `.env.staging` |
| `STAGING_QA_PASSWORD` | QA hesap parolası (`seed-staging-roles`) |
| `STAGING_ADMIN_PASSWORD` | `render.staging.env` `INITIAL_ADMIN_PASSWORD` |
| `STAGING_DATABASE_URL` | `.env.staging` (kayıt turu kodu okur, temizlik yapar) |
| `STAGING_SUPABASE_URL` | `.env.staging` |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | `.env.staging` |

Sır yoksa iş **kırmızı biter** (sessizce yeşil görünmesin diye ilk adım kontrol
eder). Elle tetiklemek için: Actions → E2E (staging) → Run workflow.

## Üretim ortam değişkenleri — doğrulanmış durum (2026-09-12)

Bu bölüm daha önce `COOKIE_SAMESITE=lax`'ı "üretimde tanımlı değil, öneri"
diye anlatıyordu; GÜNCEL DEĞİLDİ. Render `rothern-api` ortamında doğrulandı:

| Değişken | Değer | Durum |
| --- | --- | --- |
| `COOKIE_SAMESITE` | `lax` | tanımlı |
| `COOKIE_DOMAIN` | `.rothern.com` | tanımlı |
| `SENTRY_DSN` | dolu | tanımlı |

Yani CSRF double-submit guard üretimde AÇIK. `staging-csrf.spec.ts:53`
("oturum var ama CSRF başlığı yok → mutasyon reddedilir") bu duruşu her
gecelik koşumda sınar.

Bu ikisi bir ÇİFTTİR, tek başına değiştirilmez: `lax` iken `COOKIE_DOMAIN`
boş kalırsa çerezler `api.rothern.com`'a host-only yazılır, `www` üzerindeki
JS `rk_csrf`'i okuyamaz, `X-CSRF-Token` boş gider ve TÜM mutasyonlar 403
döner — giriş çalışmaya devam ettiği için sessiz kırılmadır.
`apps/api/src/common/config/prod-config-sanity.ts` bu kombinasyonu boot'ta
fail-closed yakalar (`main.ts:89`), yani hatalı ENV ile deploy AYAĞA KALKMAZ.

### Açık bulgular (2026-09-12)

- **Vercel'de Sentry yok.** `supkeys-web` ve `supkeys-admin` projelerinin
  hiçbirinde `SENTRY_DSN` ya da `NEXT_PUBLIC_SENTRY_DSN` tanımlı değil.
  `instrumentation.ts` DSN yoksa `return` ediyor → ön yüz hata izleme KOMPLE
  no-op; istemci hataları yalnız `console.error`'a düşüyor
  (`api/client-error/route.ts`). API tarafı etkilenmiyor, orada DSN dolu.
- **Render planı sapması.** `render.yaml` `plan: starter` diyor ama
  `rothern-api` dashboard'da **Free** ($0, 0.1 CPU, 512 MB). Free örnek
  boşta uyur → ilk istek 30-60 sn. Blueprint ile dashboard ayrışmış.
