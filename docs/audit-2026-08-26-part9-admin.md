# Denetim 2026-08-26 — Parça 9: Admin

Kapsam: `apps/api/src/modules/admin-auth/**`, `admin-companies/**`,
`admin-system/**`, `admin-audit/**`, `email/admin-email-logs.*` (26 dosya /
5.014 satır) + `apps/admin` (18 sayfa).

**Yöntem notu — bu tur diğerlerinden farklı koştu.** 7 mercek ajanı paralel
başlatıldı; 5'i (yetki matrisi, müdahaleler, loglar, ön yüz, veri/ölçek)
haftalık limitte düştü, 2'si (KYC, sistem) boşta kaldı ve raporunu teslim
etmedi. Bulgular bu nedenle **tek denetçinin (ana oturum) doğrudan kod okuması**
ile toplandı ve her iddia okunarak doğrulandı; ayrı bir çürütücü ajan turu
yerine **kendi adaylarımı sözleşme testleri + karşı-kod ile çürüttüm** (7 aday
düştü, aşağıda). Kapsam genişliği 1-8. parçalardaki 7-ajan taramasından **dar**:
`reviewDocuments`/`reviewDocRevision` iç mantığı, `deleteOrAnonymize` tamamı,
`extendMembership`, `time-savings-config` ve sayfa-sayfa UI↔API parite tablosu
bu turda YÜZEYSEL kaldı — Dalga B'de kapatılmalı.

## DOĞRULANAN

| # | Şiddet | Bulgu | Kanıt |
|---|--------|-------|-------|
| 1 | MED | **`listingDetail` ham satır dönüyor** — `include` var ama ilan gövdesinde `select` yok, tüm kolonlar çıkıyor: `internalNotes` (şemada "yalnızca açan firma görür" = alıcının özel değerlendirme notu), `logistics` Json (adres/iletişim), `cancelReason`, ileride eklenecek her kolon. Uç `@AllowAnyAdminRole()` → SUPPORT dahil. Parça 3 #3'te `orderDetail` için tam bu sızıntı kapatılıp gerekçesi koda yazılmıştı; **kardeşi (hemen üstündeki metot) atlanmış** | `admin-inspection.service.ts:68-124`; karşılaştır `orderDetail` `:325-345` açık `select` |
| 2 | MED | **E-posta "Yeniden Gönder" tam da destek senaryosunda bozuk.** `REDACTED_CONTEXT_TYPES` (password_reset, login_2fa, email_verify, referral_invite, tender_external_invite, company_user_invitation) için `EmailLog.payload` DB'ye `{__redacted:…}` olarak yazılıyor (doğru karar). `resend()` ise gönderimi **aynı payload'la** yapıyor → kullanıcıya kodsuz/token'sız (ya da render patlarsa hiç) e-posta gidiyor, admin'e `success:true` dönüyor. "Doğrulama kodu gelmedi" çağrısı ekranın var oluş sebebi ve tam bu 6 tipte çalışmıyor | `email.service.ts:35-48,160-166` (maskeleme) + `admin-email-logs.service.ts:20-56` (payload'ı aynen gönderim) |
| 3 | MED | **Admin panosu ilan kırılımı MECE değil:** `CLOSED` (admin moderasyonu) ve `IN_APPROVAL` (yayın onayı) hiçbir kovada yok; `published = total - draft` ise onları sayıyor. 100 ilan / 10 taslak / 5 IN_APPROVAL / 3 CLOSED → ekran "90 yayınlanmış" der, kovalar 82'yi açıklar, 8 ilan buharlaşır | `admin-companies.service.ts:388-420` (`open/inAward/awarded/closedNoAward` kovaları) vs `ListingStatus` enum'unun 9 değeri |
| 4 | MED | **KYC kuyruğu sayacı ile listesi farklı evren sayıyor:** `list(queue="kyc")` PENDING firmalar **VE** VERIFIED kalıp `kycRevisions` PENDING olanları gösteriyor (Faz Y A-modeli); `stats.pendingReview` yalnız `companyVerificationStatus=PENDING` sayıyor. Rozet "3" derken kuyrukta 5 satır olur | `admin-companies.service.ts:163-179` (liste) vs `:357` (`pendingReview`) |
| 5 | MED | **`membershipReport` sessiz kesiliyor ve TOPLAMLARI kesilmiş veriden hesaplıyor:** `take:1000`, ardından `totals.monthsGranted` (= "gelirin vekil ölçüsü") `rows` üzerinden `reduce` ediliyor; `truncated` bayrağı yok. 1000+ olaylı bir dönemde satış raporu sessizce eksik | `admin-companies.service.ts:1022-1052` |
| 6 | MED | **Admin duyurusu bildirim tercihine hiç bağlı değil ve varsayılan olarak "kapatılamaz" sınıfta.** `PREF_KEY_BY_TYPE`'ta `admin_announcement` yok → `isNotificationEnabled` kuralı gereği **transactional** sayılır (helper'ın kendi dokümanı: "Anahtarı olmayan tipler TRANSACTIONAL'dır"). Oysa tier/ülke segmentli duyuru ticari ilettir; opt-out yolu yok | `notification-prefs.ts:26-42` + `admin-companies.service.ts:1296-1360` (`announce` hiçbir tercih okumuyor) |
| 7 | MED | **`setVerification` durumsuz:** ön koşul/CAS yok. (a) VERIFIED firma yeniden onaylanabilir → `companyVerifiedAt` sıfırlanır + ikinci "onaylandı" e-postası; iki admin aynı anda karar verirse iki audit + iki e-posta. (b) Belgesi hiç yüklenmemiş (UNVERIFIED, 0/6) firma doğrudan VERIFIED yapılınca `docData` **tüm** `doc*Status` kolonlarına APPROVED yazıyor → "VERIFIED = 6/6 onaylı belge" invariantı kırılır, belge kolonları null iken durum APPROVED görünür | `admin-companies.service.ts:628-660` |
| 8 | MED | **Askıya alınan firmaya hiçbir bildirim gitmiyor** — ne in-app ne e-posta; gerekçe (`blockedReason`) DB'de kalıyor. Diğer TÜM admin müdahaleleri (ilan kapatma/uzatma/yeniden açma, sipariş iptali) firmayı bilgilendiriyor. Firma bir anda her yerden 403 alır ve nedenini bilmez; şikayet üzerinden askıya almada şikayetçi de sonucu öğrenmez | `admin-companies.service.ts:1065-1081` (`suspend`), `:1440-1460` (`resolveComplaint` suspend dalı) — `notifyCompany` çağrısı yok |

## DALGA B (doğrulanan LOW)

- `assertNotLastSuperAdmin` atomik değil: `count` + `update` ayrı; eşzamanlı iki düşürme/pasifleştirme sistemi 0 SUPER_ADMIN'le bırakabilir (`admin-staff.service.ts:105-150`).
- `stats.userCount` `_count.users` filtresizken arama `deletedAt:null` süzüyor → silinmiş kullanıcılar sayıda görünür (`:346`).
- `oldestPendingSince` = `company.updatedAt`; herhangi bir profil güncellemesi KYC SLA yaşını sıfırlar (`:326-331`).
- `membershipReport` penceresi `setHours(23,59,59,999)` ile **sunucu yerel saatinde**; UTC sunucuda TR günü 3 saat kayar (`:1015-1021`).
- Duyuru önizlemesi `stats.tierBreakdown` (filtresiz) sayısını gösteriyor, gönderim `isActive:true, isBlocked:false` süzüyor → "1.000 firmaya gidecek" der, daha azına gider (`duyuru/page.tsx:36-44` vs `announce` where).
- `announce` `take:5000` sessiz tavan; audit `targets` bunu tam evren sanıyor.
- `announce` sunucu tarafı idempotent değil (UI'da önizleme+onay+`loading` disable var, o yüzden LOW).
- `setTier`: `company.update` + `companyMembershipEvent.create` + audit tek transaction'da değil → olay yazılamazsa paket değişir, geçmiş/rapor eksilir (`:905-920`).
- `cancelOrder` ilana dokunmuyor: AWARDED ilan canlı siparişsiz kalır ve un-award olmadığı için kurtarma yolu yok (bilinçli boşluğun pratik sonucu, `admin-inspection.service.ts:404-487`).
- Audit append-only yalnız konvansiyon: kodda `auditLog.update/delete` yok (doğrulandı) ama DB tarafında kısıt/RLS yok.
- `list`/`listListings`/`membershipReport` tek alanlı `orderBy` → eşit damgalarda sayfalar arası kayma.
- `AdminRole` enum yorumu "SUPPORT — sadece okuma + tenant impersonate" diyor; impersonate bilinçli olarak YOK (doküman driftı).

## ÇÜRÜTÜLEN

- **"SUPPORT'a açık parola sıfırlama / oturum düşürme / kullanıcı listesi + inspection okumaları"** → BİLİNÇLİ ve sözleşmeyle kilitli: `admin-route-authz-wiring.spec.ts:97-111` bu 4 ucu "zararsız kurtarma any-role", 5 inspection okumasını "bilinçli-açık" olarak sabitliyor. Yalnız #1'deki payload fazlalığı ayakta kaldı.
- **"Askı oturumu düşürmüyor"** → `company-jwt.strategy.ts:82` her istekte `isActive || isBlocked` bakıyor; askı anında etkili.
- **"Duyuruda PAKET/STANDARD segmenti API'ye geçersiz değer gönderir"** → select yalnız 4 geçerli kademeyi sunuyor; `page.tsx:42-43`'teki dallar ölü kod (eski sözlükten kalma).
- **"`ListAuditDto.pageSize` sınırsız → tablo taraması"** → `audit.service.query` `Math.min(100, …)` ile kapıyor.
- **"Manuel kur fat-finger koruması taban yokken devre dışı"** → `getCurrentRate` asla null dönmüyor (bayat kuru ya da `FALLBACK_RATES` döner) → 10x guard her zaman çalışır.
- **"CSV formül enjeksiyonu"** → Parça 5'te kapatılmış, `apps/admin/src/lib/csv.ts` `neutralize()` yerinde.
- **"Admin ön yüzünde korumasız sayfa / CSRF baypası / XSS"** → `admin/layout.tsx` `/admin/login` hariç tüm alanı `RequireAdminAuth` ile sarıyor (sayfa başına unutma riski yapısal olarak yok); ham `fetch` yok (hepsi axios instance); `dangerouslySetInnerHTML` yok, `JSON.stringify` çıktıları JSX metni olarak React tarafından kaçırılıyor.
- **"E-posta log'unda düz token/kod saklanıyor"** → `REDACTED_CONTEXT_TYPES` kapatmış (ama bu #2'yi doğuruyor).

## DURUM

- Dalga A **UYGULANMADI** — düzeltme ONAYI bekliyor.
- Öneri sırası: #2 ve #1 (küçük, kapalı uçlu), sonra #7 ve #8 (durum/bildirim), sonra #3-#6 (sayı doğruluğu + duyuru tercih sınıfı).
