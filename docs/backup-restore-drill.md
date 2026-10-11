# Yedekten dönüş provası (runbook)

> Yedek, **geri yüklenene kadar** yedek değildir. Supabase'de PITR açık olabilir
> ama hiç denenmemiş bir kurtarma yolu, olay anında öğrenilecek bir yoldur.
> Bu prova ayda bir, 20 dakikada yapılır ve sonucu aşağıdaki tabloya yazılır.

## Ön koşullar

- Supabase planı **Pro** (Point-in-Time Recovery yalnız Pro'da).
- Elde `.env.prod.local` (canlı bağlantı) ve `.env.staging`.
- Prova **CANLI PROJEYE DOKUNMAZ**: ayrı bir "restore hedefi" projesine ya da
  branch'e dönülür.

## Adımlar

1. **Kanıt topla (öncesi).** Canlıda bilinen bir sayımı not et:
   ```bash
   # firma, kullanıcı, talep, sipariş sayıları
   psql "$PROD_DIRECT_URL" -c "select
     (select count(*) from companies) firma,
     (select count(*) from company_users) kullanici,
     (select count(*) from listings) talep,
     (select count(*) from company_orders) siparis;"
   ```
2. **Zaman damgası seç.** Supabase panel → Database → Backups → Point in Time.
   Şu andan 1 saat öncesini seç (gerçek olayda: bozulmadan hemen öncesi).
3. **Yeni projeye geri yükle.** "Restore to new project" ile `rothern-restore-<tarih>`
   projesine dön. (Aynı projeye dönmek CANLIYI geri sarar — provada ASLA.)
4. **Doğrula.** Yeni projenin bağlantı dizesiyle aynı sayımları çalıştır;
   1. adımdaki değerlerle karşılaştır. Fark yalnız son 1 saatin verisi kadar
      olmalı.
5. **Uygulamayı bağla (isteğe bağlı ama önerilir).** Staging API'sini geçici
   olarak restore projesine yönlendir (`DATABASE_URL`/`DIRECT_URL`), giriş yap,
   bir talep aç. Amaç: şema + veri + Auth birlikte çalışıyor mu?
   **Bağlamadan ÖNCE o API'ye `UNVERIFIED_SIGNUP_PURGE_ENABLED=false` ver**
   (gerekçe aşağıda "Bilinen tuzaklar"; temizlikte geri al).
   **Auth kullanıcıları ayrı taşınır** — `auth.users` PITR ile gelir, ama
   restore projesinin API anahtarları FARKLIDIR; env'leri güncellemeden giriş
   çalışmaz. Provanın en sık takıldığı yer burasıdır.
6. **Temizle.** Restore projesini SİL (ücret işlemesin), staging env'ini geri al
   (`UNVERIFIED_SIGNUP_PURGE_ENABLED` satırını da SİL — staging'de tanımsız
   kalmalı, yoksa temizlik orada kapalı kalır).

## Kurtarma hedefleri

| Ölçüt | Hedef | Not |
|---|---|---|
| RPO (kabul edilen veri kaybı) | ≤ 5 dk | PITR ile teoride saniyeler |
| RTO (ayağa kalkma süresi) | ≤ 2 saat | yeni proje + env güncelleme + DNS yok |

## Prova kaydı

| Tarih | Yapan | PITR hedefi | Sonuç | Süre | Not |
|---|---|---|---|---|---|
| — | — | — | henüz yapılmadı | — | ilk prova Supabase Pro'ya geçince |
| 2026-10-07 | Claude (yerel) | PITR değil: 2026-09-26 `pg_dump` dosyası → yerel postgres:17 | döndü; 27 migration + kurulum betikleri sorunsuz, sayımlar önce/sonra aynı | — | canlıya dokunulmadı; PITR yolu hâlâ denenmedi. Ön koşul: `pg_trgm` + `rothern_app` rolü |

## Bilinen tuzaklar

- **Sadece veritabanı yetmez:** R2'deki görseller/belgeler ayrı yaşar. Bucket
  sürüm/replikasyon ayarını da kontrol et; DB geri döner ama görseller silinmişse
  ürün sayfaları boş kalır.
- **Migration durumu:** restore edilen şema, o andaki migration'larla uyumludur.
  Geri dönülen an ile bugünkü kod arasında migration varsa `migrate deploy`
  gerekir; `migrate dev` ASLA (sıfırlar).
- **Cron'lar:** restore projesine bağlanan bir API örneği zamanlanmış işleri de
  koşar (e-posta gönderir!). `RESEND_API_KEY`'i BOŞ BIRAKMA: boş anahtarla API
  açılmaz (`new Resend('')` "Missing API key" fırlatır; sebep günlükte
  `[Bootstrap] Application failed to start: …`). Güvenli yol: geçerli biçimde
  sahte bir anahtar (`re_prova_gecersiz`) **ve** hiçbir alıcıyla eşleşmeyen
  `EMAIL_ALLOWLIST` (ör. `kimse@prova.invalid`). İzin listesi doluyken listede
  olmayan alıcıya e-posta sağlayıcıya GİTMEZ; satır `email_logs`a `FAILED` +
  `suppressed: allowlist: …` olarak yazılır (2026-10-07 provasında 0 e-posta).
  Prova API'sinin `WEB_URL`'i `rothern.com` altında VE `NODE_ENV=production` ise
  dolu `EMAIL_ALLOWLIST` açılışı keser: `WEB_URL`'i staging alan adında bırak
  (ya da yalnız o prova ortamında `ALLOW_STAGING_ONLY_ENV=true`; canlıda ASLA).
- **Doğrulanmamış kayıt temizliği kaynağın GİRİŞ KİMLİKLERİNİ siler:** yedekten
  dönülen kopyaya bağlanan API MUTLAKA `UNVERIFIED_SIGNUP_PURGE_ENABLED=false`
  ile açılır. Bu iş (gece 05:10 + kayıt / ekip daveti anında) e-postası 7 gündür
  doğrulanmamış kaydı siler ve auth sağlayıcısındaki (Supabase) kullanıcıyı da
  KALICI siler; kararı KENDİ veritabanının satırlarına göre verir. Kopya,
  kaynağıyla aynı auth projesini kullanıyorsa (staging dökümü staging auth
  anahtarlarıyla, canlı dökümü canlı auth anahtarlarıyla açılırsa; staging
  dökümüyle kurulan yerel test ortamı da böyledir) döküm anında doğrulanmamış
  olup SONRADAN doğrulanan hesapların giriş kimliği kaynakta silinir: hesap
  doğrulanmış görünür ama bir daha giriş yapamaz, şifre sıfırlama da
  onarmaz. Değişken tanımsızken iş yalnız
  `NODE_ENV=production` ile AÇIKTIR (staging de production kipinde koşar);
  başka kipte kapalıdır ama provada kipe güvenmeyin, `false` yazın. Açılış
  günlüğünde durumu doğrulayın: `Unverified sign-up purge is OFF …`.
- **`pg_dump` dosyasından dönüş (PITR değil; runbook 4. adımdaki yedek):** döküm
  yalnız `public` şemasını taşır. `pg_restore`'dan ÖNCE hedef veritabanında
  `CREATE EXTENSION pg_trgm SCHEMA public;` çalıştır; yoksa
  `categories_nameTr_trgm_idx` ve `categories_searchText_trgm_idx` "operator
  class public.gin_trgm_ops does not exist" ile kurulamaz. Döküm yalnız
  `rothern_app` rolüne GRANT verir: rol hedefte önceden var olmalı. 2026-10-07'de
  `prod-before-i18n-migrations-20260926-2329.dump` yerel postgres:17'ye bu
  sırayla sorunsuz döndü; ardından `migrate deploy` 27 migration'ı 4,5 sn'de
  uyguladı (`migrate dev` ASLA).
