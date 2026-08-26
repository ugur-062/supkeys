# Denetim 2026-08-26 — Parça 9: Admin

Kapsam: `apps/api/src/modules/admin-auth/**`, `admin-companies/**`,
`admin-system/**`, `admin-audit/**`, `email/admin-email-logs.*` (26 dosya /
5.014 satır) + `apps/admin` (18 sayfa).

**Yöntem notu — bu tur diğerlerinden farklı koştu.** 7 mercek ajanı paralel
başlatıldı; 5'i (yetki matrisi, müdahaleler, loglar, ön yüz, veri/ölçek)
haftalık limitte düştü, 1'i (sistem/duyurular) hiç teslim etmedi. **Mercek 2
(KYC/başvuru) bir gün sonra tam raporunu teslim etti** ve bulguları buraya
alındı. Kalan 6 merceğin alanı **tek denetçinin (ana oturum) doğrudan kod
okuması** ile tarandı. Çürütme ayrı ajan turu yerine **sözleşme testleri +
karşı-kod okuması** ile yapıldı: mercek 2'nin 10 HIGH/MED iddiasının **9'u
doğrulandı, 1'i çürütüldü, 1'i daraltıldı**; ana oturumun kendi adaylarından
7'si düştü. Kapsam genişliği 1-8. parçalardan **dar**: `admin-system`
(`time-savings-config`, suppressions), şikayet moderasyonu ön yüzü ve
sayfa-sayfa UI↔API parite tablosu yüzeysel kaldı → Dalga B.

## DOĞRULANAN — HIGH

| # | Bulgu | Kanıt |
|---|-------|-------|
| 1 | **`POST /companies/:id/verify` belge kontrolü olmadan toptan onaylıyor ve BOŞ belge kolonlarını KALICI kilitliyor.** `setVerification` kaynak durumu, belge yüklü mü, zorunlu KYC alanları dolu mu — hiçbirine bakmıyor; `docData` **`DOC_META`'nın TÜM anahtarlarını** (ülkeye göre zorunlu olmayanlar ve hiç yüklenmemiş olanlar dahil) `APPROVED` yazıyor. Kardeş uç `reviewDocuments`'ta bu kapı VAR: `if (!uploaded) throw new BadRequestException("Eksik belge var; karar verilemez")`. Sonuç iki yönlü: (a) sıfır belgeli, hiç `submit()` yapmamış (MERSİS/sicil/IBAN NULL) firma VERIFIED olur → `assertVerified` kapısı açılır; (b) firma o belgeleri **artık asla yükleyemez** — `company-docs.service.ts` `docStatus === "APPROVED"` kilidi, VERIFIED→revizyon (A-modeli) dalından ÖNCE geliyor. Tek çıkış adminin `/reject` ile hepsini sıfırlamasıdır; o zamana kadar KYC'siz VERIFIED firma hiçbir kuyrukta görünmez (`queue=kyc` yalnız PENDING + bekleyen revizyon getirir). **Erişilebilirlik:** admin panelinde bu ucu çağıran ekran yok — ama `useCompanyAction` hook'u `action: "verify"` değerini zaten kabul ediyor, yani tek bir JSX satırı uzağında | `admin-companies.service.ts:628-660` (kapısız) vs `:715` (kardeş kapı); kilit `company-docs.service.ts:229-240`; hook `apps/admin/src/hooks/use-admin-companies.ts:118-140` |

## DOĞRULANAN — MED

| # | Bulgu | Kanıt |
|---|-------|-------|
| 2 | **E-posta "Yeniden Gönder" tam da destek senaryosunda bozuk.** `REDACTED_CONTEXT_TYPES`'ın 6 tipinde (password_reset, login_2fa, email_verify, referral_invite, tender_external_invite, company_user_invitation) `EmailLog.payload` DB'ye `{__redacted:…}` yazılıyor (doğru karar). `resend()` gönderimi **aynı payload'la** yapıyor → kullanıcıya kodsuz/token'sız (render patlarsa hiç) e-posta gidiyor, admin'e `success:true` dönüyor | `email.service.ts:35-48,160-166` + `admin-email-logs.service.ts:20-56` |
| 3 | **Belge incelemesinde sürüm sabitlemesi yok.** Karar payload'ı `{status, reason}` taşıyor; incelenen nesnenin anahtarını/sürümünü taşımıyor, CAS yok. Firma REJECTED durumdayken belgeyi yeniden yükleyebiliyor (`docStatus !== "APPROVED"` dalı). Admin ekranı açıkken firma belgeyi değiştirirse admin **hiç görmediği** nesneyi APPROVED yapar ve o nesne kalıcı kilitlenir; audit'te yalnız `{status, rejected}` var, hangi nesnenin onaylandığı yazılmıyor. (Mercek 2 HIGH önerdi; eşzamanlılık gerektirdiği için MED'e çekildi — kayıp yok, izlenebilirlik kaybı var) | `admin-companies.service.ts:698-760`; karşı örnek CAS `:829` (`reviewDocRevision`) |
| 4 | **Onay/ret idempotent değil, iki admin arasında CAS yok.** Her iki uç da koşulsuz `company.update`; bildirim de koşulsuz. İki admin çelişkili karar verirse son yazan kazanır, firma ardışık iki çelişkili e-posta alır. VERIFIED firmada "Kararı Kaydet" `companyVerifiedAt`'ı bugüne çeker (doğrulama tarihi geçmişi kaybolur) + yeni "onaylandı" e-postası atar; UI kapı koymuyor (VERIFIED firmada da form render ediliyor) | `admin-companies.service.ts:628,698`; `docs-tab.tsx:88-101,285` |
| 5 | **`extendMembership` oku-sonra-yaz — kayıp güncelleme (para).** `findUnique` → JS'te `setMonth` → `update`; transaction/CAS/satır kilidi yok. Çift tıkta iki uzatma aynı tabanı okur, müşteri 24 yerine 12 ay alır; `CompanyMembershipEvent`'te İKİ EXTEND satırı (24 ay) kalır → `membershipReport` "satılan ay" toplamı gerçekle çelişir. `setTier` de aynı desende ve `endBefore`'u bayat okumadan yazar | `admin-companies.service.ts:941-962`, `:895-906` |
| 6 | **Elle paket kaldırma (REVOKE) otomatik süre-dolma yolunun temizliğini yapmıyor.** Cron downgrade'i üç iş yapıyor: atomik claim, firmanın GÖNDERDİĞİ bekleyen bağlantı+referans davetlerinin silinmesi, "üyeliğiniz sona erdi" e-postası. `setTier(…, "STANDART")` hiçbirini yapmıyor. Kalan PENDING davet karşı tarafça kabul edilirse `isConnectionValid` davet edenin tier'ı BRONZ altı olduğu için bağlantıyı geçersiz sayar → "kabul ettim ama bağlantı yok" hayaleti. Paket VERME de sessiz (firma bildirilmiyor) | `admin-companies.service.ts:884-928` vs `membership.scheduler.ts:112-175`; `common/company/valid-connection.ts` |
| 7 | **Admin KYC belge önizlemesi çalışmıyor ve belgeleri diske yayıyor.** `detail()` KYC belgelerini `presignStoredObject("private", …)` ile üretiyor; `generatePresignedGet` Parça 5'ten beri **koşulsuz** `attachment` + `application/octet-stream` basıyor (inline varyantı yok). DocsTab'ın `<iframe>` önizlemesi ve "Görüntüle" linki indirmeye dönüşüyor → inceleyen her KYC belgesini (kimlik ön/arka dahil) admin makinesine indirmek zorunda; Parça 5'in amacının tersi veri yayılımı | `storage.service.ts:270-279`; `admin-companies.service.ts:495-505`; `docs-tab.tsx:225,237` |
| 8 | **Değiştirilen eski KYC belgeleri R2'da öksüz kalıyor ve KVKK imhasından kurtuluyor.** `reviewDocRevision` onayda kolonu yeni anahtarla eziyor, eskiyi silmiyor/saklamıyor; REJECTED durumda yeniden yükleme de aynı. `purgeCompanyObjects` yalnız GÜNCEL kolon değerlerini + `kycRevisions` anahtarlarını topluyor → v1/v2 taramaları (vergi no, imza, kimlik) private bucket'ta süresiz kalır, silme raporu "temizlendi" der | `admin-companies.service.ts:845-853`, `:1640-1655`; `company-docs.service.ts:246-254` |
| 9 | **KVKK silmede geri alınamaz yan etkiler kalıcı DB değişikliğinden ÖNCE yapılıyor.** Sıra: Supabase auth hesapları sil → R2 purge → AI oturumları sil → **sonra** `company.delete`/anonimleştirme transaction'ı + audit. İlk üç adım geri alınamaz, telafi yok. Son adım patlarsa: kimsenin giremediği, belgeleri 404 veren "canlı" firma satırı kalır ve audit satırı hiç yazılmaz | `admin-companies.service.ts:1714-1760` |
| 10 | **Admin para/yetki aksiyonlarının hiçbiri `critical` audit değil.** `admin-companies.service.ts`'teki **17 `audit.log` çağrısından yalnız 1'i** (`exportData:1549`) kritik. `AuditService.log()` bilinçli olarak throw etmiyor; yalnız `critical:true` girdiler `[AUDIT-KRİTİK-KAYIP]` + Sentry üretiyor. Kritik işaretlenmeyenler: `tier_set`, `membership_extended` (para), `verification_set`, `docs_reviewed` (KYC kapısı), `profile_updated` (IBAN dahil), `suspended`, `deleted`/`anonymized` (geri alınamaz). Karşı örnek: firma tarafı IBAN yazımını `critical` işaretliyor | `admin-companies.service.ts` (grep: 17 çağrı / 1 kritik); `audit.service.ts:44-88` |
| 11 | **`updateProfile` ham IBAN'ı audit'e yazıyor ve KYC kimlik alanlarını doğrulamasız değiştiriyor.** `changes[key] = { from: prev, to: … }` → `iban`, `ibanHolder`, `taxNumber`, `mersisNo`, `tradeRegistryNo`, `billingEmail` düz metin olarak `audit_logs.metadata`'ya düşüyor ve firma detayının Denetim sekmesinden okunabiliyor — firma tarafındaki `maskIban` kararıyla çelişir. DTO yalnız `@MaxLength`; `submit()`'teki `/^TR\d{24}$/` IBAN + MERSİS kontrolleri admin yolunda YOK | `admin-companies.service.ts:598-624`; DTO `admin-companies.controller.ts:118-195`; karşı örnek `company-docs.service.ts:406` |
| 12 | **Admin panosu ilan kırılımı MECE değil:** `CLOSED` (moderasyon) ve `IN_APPROVAL` (yayın onayı) hiçbir kovada yok; `published = total - draft` onları sayıyor. 100 ilan / 10 taslak / 5 IN_APPROVAL / 3 CLOSED → ekran "90 yayınlanmış" der, kovalar 82'yi açıklar | `admin-companies.service.ts:388-420` vs `ListingStatus` (9 değer) |
| 13 | **KYC kuyruğu sayacı ile listesi farklı evren sayıyor:** `list(queue="kyc")` PENDING **ve** VERIFIED-ama-`kycRevisions`-PENDING firmaları getiriyor; `stats.pendingReview` yalnız PENDING sayıyor. Rozet "3" derken kuyrukta 5 satır olur | `:163-179` vs `:357` |
| 14 | **`membershipReport` sessiz kesiliyor ve TOPLAMLARI kesilmiş veriden hesaplıyor:** `take:1000`, ardından `totals.monthsGranted` (gelirin vekil ölçüsü) `rows` üzerinden `reduce`; `truncated` bayrağı yok | `:1022-1052` |
| 15 | **Admin duyurusu bildirim tercihine bağlı değil ve "kapatılamaz" sınıfta.** `PREF_KEY_BY_TYPE`'ta `admin_announcement` yok → helper'ın kendi kuralıyla **transactional** sayılır. Tier/ülke segmentli duyuru ticari iletidir; opt-out yolu yok | `notification-prefs.ts:26-42`; `admin-companies.service.ts:1296-1360` |
| 16 | **`listingDetail` ham satır dönüyor** — ilan gövdesinde `select` yok: `internalNotes` (şemada "yalnızca açan firma görür"), `logistics` Json (adres/iletişim), ileride eklenecek her kolon. Uç `@AllowAnyAdminRole()`. Parça 3 #3'te `orderDetail` için bu sızıntı kapatılıp gerekçesi koda yazılmıştı; **hemen üstündeki kardeşi atlanmış** | `admin-inspection.service.ts:68-124` vs `:325-345` |
| 17 | **Askıya alınan firmaya hiçbir bildirim gitmiyor** — ne in-app ne e-posta; gerekçe DB'de kalıyor. Diğer TÜM müdahaleler (ilan kapatma/uzatma/yeniden açma, sipariş iptali) bildiriyor. Şikayet üzerinden askıda şikayetçi de sonucu öğrenmez | `:1065-1081`, `:1440-1460` |

## DALGA B (doğrulanan LOW) — UYGULANDI (`f17cd3bb`), B12 hariç

- Zorunlu KYC kimlik alanları (MERSİS/sicil/IBAN) yalnız firma `submit()`'inde denetleniyor; admin onay yolu boş alanlarla VERIFIED yapabiliyor (`company-docs.service.ts:373-390`).
- Ülke değişimi zorunlu belge SETİNİ değiştiriyor (yabancı 3 / TR 6) ama VERIFIED durumu ve kuyruk görünürlüğü değişmiyor — eksik hiçbir zaman kuyrukta belirmez.
- Admin audit satırlarında `actorEmail`/`ip`/`userAgent` yok; attribution yalnız `PlatformAdmin.id`'ye bağlı (Parça 1'in `resolveClientIp` altyapısı hazır).
- `assertNotLastSuperAdmin` atomik değil: `count` + `update` ayrı → eşzamanlı iki düşürme sistemi 0 SUPER_ADMIN'le bırakabilir (`admin-staff.service.ts:105-150`).
- `stats.userCount` silinmiş (`deletedAt`) kullanıcıları sayıyor; arama ise süzüyor.
- `oldestPendingSince` = `company.updatedAt`; herhangi bir profil güncellemesi KYC SLA yaşını sıfırlar.
- `membershipReport` penceresi `setHours` ile sunucu yerel saatinde; UTC sunucuda TR günü 3 saat kayar.
- Duyuru önizlemesi `stats.tierBreakdown` (filtresiz) gösteriyor, gönderim `isActive:true, isBlocked:false` süzüyor.
- `announce` `take:5000` sessiz tavan; sunucu tarafı idempotency yok (UI'da önizleme+onay+disable var).
- `setTier`: `update` + `membershipEvent.create` + audit tek transaction'da değil.
- `cancelOrder` ilana dokunmuyor: AWARDED ilan canlı siparişsiz kalır, un-award olmadığı için kurtarma yok.
- **AÇIK (B12) — KARAR BEKLİYOR:** Audit append-only yalnız konvansiyon. Kodda
  `auditLog.update/delete` YOK (doğrulandı) ama DB tarafında kısıt yok. Bunu
  bir trigger/kural ile zorlamak prod DB davranışını kalıcı değiştirir
  (`CREATE TRIGGER` kısa ACCESS EXCLUSIVE kilit alır; ileride bir saklama/
  retention temizliği gerekirse kaldırılması gerekir) ve bekleyen RLS
  aktivasyonuyla birlikte planlanmalı → ayrı onay konusu.
- **Kısmen kapatıldı:** admin audit satırları artık `actorEmail` taşıyor
  (AuditService `PlatformAdmin`'den çözüyor); `ip`/`userAgent` hâlâ yok —
  istek-kapsamlı ALS gerektiriyor (interceptor + observable bağlamı), ayrı iş.
- Tek alanlı `orderBy` (list/listListings/membershipReport) → eşit damgalarda sayfa kayması.
- `AdminRole` enum yorumu "SUPPORT — sadece okuma + tenant impersonate" diyor; impersonate bilinçli olarak YOK (doküman driftı).

## ÇÜRÜTÜLEN

- **"Elle paket atamada KYC ön koşulu yok → doğrulanmamış firmaya GOLD"** (mercek 2, MED) → **ÇÜRÜTÜLDÜ.** Tier ve KYC bilinçli olarak BAĞIMSIZ kapılar (CLAUDE.md Faz T/Y); bağlayıcı akışlar ayrıca `assertVerified` istiyor. "Askıdaki firmaya paket verilebiliyor" kısmı da etkisiz: `company-jwt.strategy.ts:82` `isBlocked` firmayı her istekte kapıda durduruyor, yani askı sürerken AI bütçesi de dizin görünürlüğü de kullanılamıyor. Geriye kalan (tier verirken gerekçe/kritik audit yok) #10'un kapsamında.
- **"SUPPORT'a açık parola sıfırlama / oturum düşürme / kullanıcı listesi + inspection okumaları"** → BİLİNÇLİ ve sözleşmeyle kilitli: `admin-route-authz-wiring.spec.ts:97-111` bu 4 ucu "zararsız kurtarma any-role", 5 inspection okumasını "bilinçli-açık" olarak sabitliyor. Yalnız #16'daki payload fazlalığı ayakta kaldı.
- **"Askı/ret oturumu düşürmüyor"** → `company-jwt.strategy.ts:82` her istekte bakıyor; anında etkili. (Canlı işlerin sürmesi — açık ilan/teklif/sipariş — bilinçli; mercek 2 de INFO olarak işaretledi.)
- **"Duyuruda PAKET/STANDARD segmenti API'ye geçersiz değer gönderir"** → select yalnız 4 geçerli kademeyi sunuyor; `duyuru/page.tsx:42-43` dalları ölü kod.
- **"`ListAuditDto.pageSize` sınırsız → tablo taraması"** → `audit.service.query` `Math.min(100, …)` ile kapıyor.
- **"Manuel kur fat-finger koruması taban yokken devre dışı"** → `getCurrentRate` asla null dönmüyor (bayat kur ya da `FALLBACK_RATES`) → 10x guard hep çalışır.
- **"CSV formül enjeksiyonu"** → Parça 5'te kapatılmış, `apps/admin/src/lib/csv.ts` `neutralize()` yerinde.
- **"Admin ön yüzünde korumasız sayfa / CSRF baypası / XSS"** → `admin/layout.tsx` `/admin/login` hariç tüm alanı `RequireAdminAuth` ile sarıyor (sayfa başına unutma riski yapısal olarak yok); ham `fetch` yok; `dangerouslySetInnerHTML` yok, `JSON.stringify` çıktıları JSX metni olarak kaçırılıyor.
- **"E-posta log'unda düz token/kod saklanıyor"** → `REDACTED_CONTEXT_TYPES` kapatmış (ama bu #2'yi doğuruyor).
- `AdminRolesGuard` fail-closed (işaretsiz uç reddedilir) — `admin-roles.guard.spec.ts` + wiring spec ile kilitli, sağlam.

## DURUM

- **Dalga A UYGULANDI (2026-08-26, `c883cc3a` + `70b5c03f`): #1-#17'nin tamamı.**
- Yeni yetenekler/sözleşmeler:
  - `StorageService.presignInlinePreview` — satır-içi önizleme; yanıt içerik tipi
    SUNUCUDA beyaz listeden sabitlenir (XSS'i kapatan `attachment` değil, tipin
    sabitlenmesidir), uzantı listede yoksa `attachment`'a düşer.
  - `notification-prefs`'e `announcement` anahtarı (`admin_announcement` artık
    kapatılabilir); web bildirim tercihleri ekranında "Platform duyuruları".
  - `detail()` → `docKeys`: belge kararının sürüm sabitlemesi (ön yüz anahtarı
    geri gönderir, arada değiştiyse 409).
  - `membershipReport` → `truncated` + `totalMatching`; toplamlar `groupBy` ile
    TÜM evrenden (tavandan bağımsız), UI'da kesilme uyarısı.
  - `stats().listings` → `inApproval` + `moderationClosed` kovaları (MECE).
- Testler: `test/integration/audit-part9-dalga-a.spec.ts` (13) + **tam API suite
  143 suite / 1242 test yeşil** + web 336 + admin 79.
- GOTCHA'lar (sonraki turlar için):
  - `AuditLog`'da **`critical` KOLONU YOK** — yalnız `AuditService` girdisinde
    bayrak (yazım hatasında `[AUDIT-KRİTİK-KAYIP]` + Sentry). Sözleşme testi DB
    satırından değil ÇAĞRIDAN doğrulanmalı.
  - Rig stub tuzağı **dördüncü kez**: yaygın-enjekte `StorageService`'e yeni
    çağrı (`presignInlinePreview`) + `company-docs`'ta yeni `.catch()` zinciri,
    5 spec'in stub'ını kırdı (`deleteObject: jest.fn()` promise döndürmüyordu).
    Tek spec koşumu bunu YAKALAMAZ; tam suite şart.
- Mercek 1/3/5/6/7 alanları tek denetçiyle tarandığı için Dalga B'de bir ajan turu tekrarlanmalı (özellikle `admin-system` ve sayfa-sayfa parite).
