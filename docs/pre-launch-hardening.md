# Yayın öncesi sertleştirme planı (2026-09-16)

> Bu paket **gerçek müşteri verisi girmeden hemen önce** koşulur. Bugün canlı
> BOŞ (firma/kullanıcı 0) — bu, adımların çoğunu ucuz ve geri alınabilir yapıyor.
> Sıra bilinçli: önce geri dönüşü olan işler, en sonda para ve kesinti getirenler.
>
> Tamamlananlar bu dosyada DEĞİL, `CLAUDE.md` "Güvenlik Durumu" bölümünde.
> Ortam adları: Supabase canlı `rothern-prod`, staging `rothern-staging`.

## Faz 1 — Satır seviyesi güvenlik (RLS) canlıda AÇIK

> **DURUM 2026-09-16: STAGING'DE AÇIK VE DOĞRULANDI.** `rothern_app` rolü
> kuruldu (NOBYPASSRLS), Render staging `DATABASE_URL` o rolle bağlanıyor
> (`pg_stat_activity`de 5 bağlantı), `RLS_ENABLED=true`. Kanıt: üç demo firma
> kendi ürünlerini TAM sayıyla görüyor (5/4/3) — bağlam yazılmasaydı ürün
> politikası hiç satır döndürmezdi; Gold hesabı Silver'ın ürününü açmaya
> çalışınca 404. Canlı adımı BEKLİYOR (staging bir gün gözlendikten sonra).

**Neden:** bugün kiracı ayrımı yalnız servis katmanında. Bir sorguda `tenantId`
süzgeci unutulursa başka firmanın verisi döner. RLS bunu veritabanı seviyesinde
yakalar (INV-MT-5 backstop).

**Bugünkü durum:** politikalar 23 tabloda KURULU, uygulama kodu hazır
(`rls-extension.ts` → `SET LOCAL app.current_company_id`), bayrak
`RLS_ENABLED` kapalı ve uygulama veritabanına SAHİP rolle bağlanıyor — sahip
rol RLS'i bypass eder, yani bugün açsak bile hiçbir şey değişmez.

**Adımlar**
1. **Kısıtlı rol canlıda oluşturulur** (`20260719130000_rls_restricted_role`
   migration'ı Supabase'de süper yetki ister → SQL Editor'den elle koşulur).
   Rol: `rothern_app`, `NOBYPASSRLS`.
2. **Bağlantı dizesi değişir:** Render `rothern-api` → `DATABASE_URL` kullanıcı
   adı `postgres` yerine `rothern_app`. `DIRECT_URL` (migration) SAHİP kalır —
   migration'lar RLS'e takılmamalı.
3. **`RLS_ENABLED=true`** Render'da set edilir.
4. Sıra: **önce staging**, bir tam gün gözlem, sonra canlı.

**Doğrulama**
- `rls-isolation.spec` kısıtlı rolle yeşil (CI).
- Staging'de iki demo firmayla el turu: A firması B'nin talebini/siparişini
  göremiyor; listelerde sayı düşmüyor.
- Hata günlüğünde `permission denied` / boş liste patlaması YOK.

**Risk ve geri dönüş:** yanlış bir politika "veri yok" gibi görünür. Geri dönüş
tek adım: `RLS_ENABLED=false` (uzantı passthrough'a döner) ve gerekirse
`DATABASE_URL` sahip kullanıcıya geri alınır. Kod değişmez.

## Faz 2 — Veritabanı bağlantısının sertleştirilmesi

**Adımlar**
1. **Zorunlu SSL** (Supabase → Database Settings → Enforce SSL). Önce staging.
   Prisma bağlantıları zaten TLS; yine de staging'de bir tam akış koşulmadan
   canlıya alınmaz.
2. **IP kısıtlaması** — ancak Render'ın SABİT çıkış IP'leri doğrulandıktan
   sonra. Render servisinin outbound IP listesi + kendi IP'n eklenir; liste
   eksikse API veritabanına HİÇ bağlanamaz. Şüphe varsa bu madde ATLANIR:
   zorunlu SSL + güçlü parola + PgBouncer yeterli ikinci savunma.

**Doğrulama:** staging API sağlık ucu `database: up`, bir giriş + bir mutasyon.

> **DURUM 2026-09-16: STAGING'DE AÇIK VE DOĞRULANDI** (sağlık `database: up`,
> giriş 200, yetkili mutasyon 400 = guard geçti). **CANLIDA KESİNTİ YARATIR:**
> Supabase ayarı veritabanını YENİDEN BAŞLATIYOR (birkaç dakika). Canlıda
> müşteri trafiği yokken yapılmalı.

## Faz 3 — Yedek ve kurtarma

**Adımlar**
1. **Compute Small** (PITR ön şartı; Micro yetmiyor) — yalnız CANLI.
2. **PITR eklentisi** (7 gün) açılır. Aylık ücretli; müşteri verisi olmadan
   anlamsız, ilk gerçek kayıtlarla birlikte açılır.
3. **Geri yükleme tatbikatı:** günlük yedek YENİ bir projeye geri yüklenir,
   firma/kullanıcı sayısı karşılaştırılır, proje aynı gün silinir. Canlının
   ÜSTÜNE asla geri yükleme yapılmaz.
4. **Yüklenen dosyaların yedeği.** ⚠️ 2026-09-16: **R2'de nesne sürümleme
   ÖZELLİĞİ YOK** (panelde General/Custom Domains/CORS/Lifecycle/Bucket Lock…
   var, versioning yok) — plandaki bu madde OLDUĞU GİBİ UYGULANAMAZ. Üç seçenek:
   (a) ikinci bir kovaya düzenli sunucu-taraflı kopya (S3 SDK ile script; en
   esnek, silme/üzerine yazmaya karşı korur), (b) Bucket Lock ile saklama
   kuralı (silmeyi ENGELLER — ürün vitrinden çekilince görsel silinemez hâle
   gelebilir, önce silme yollarını gözden geçirmek gerekir), (c) kabul et:
   görseller firma tarafından yeniden yüklenebilir ve DB'deki adres kayıtları
   yedekte. Öneri: (a).

**Doğrulama:** tatbikat projesinde `SELECT count(*)` değerleri canlıyla aynı;
R2'de bir nesnenin önceki sürümü listelenebiliyor.

## Faz 4 — Gözetim

**Adımlar**
1. **Sentry uyarı kuralı:** yeni sorun ve hata hacmi artışı → e-posta/Slack.
   Şu an olay toplanıyor ama kimseye HABER GİTMİYOR.
2. **Log drain** (Render + Vercel → tek yer). Bugün günlükler yalnız panelde ve
   kısa süre saklanıyor.
3. **`audit_logs` doldurma kontrolü:** para ve yetki işlemlerinin izinin
   gerçekten yazıldığı canlıda bir kez doğrulanır.
4. **Gece e2e koşumunun bildirimi:** kırmızıya düşerse haber gelmeli.

## Sıra ve zamanlama

| Ne zaman | Faz |
|---|---|
| Şimdi (canlı boşken) | Faz 1 staging → canlı · Faz 2.1 SSL · Faz 4.1 uyarı kuralı |
| İlk gerçek müşteriden ÖNCE | Faz 3.1-3.2 (Small + PITR) · Faz 3.4 R2 sürümleme |
| İlk haftada | Faz 3.3 tatbikat · Faz 4.2-4.4 |
| Şüpheliyse atla | Faz 2.2 IP kısıtlaması |
