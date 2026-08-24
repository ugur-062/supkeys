# Denetim 2026-08-23 — Parça 4: Çok-Kiracılılık & Yetki

Yöntem: 8 mercek paralel bulgu toplama (50 ham bulgu: tenant kapsamı, RBAC
motoru, IDOR, portal/Faz O, RLS-bypass, admin realm, okuma yüzeyleri +
Parça 3'ten sarkan kazandırma→sipariş merceği) → tekilleştirme → HIGH/MED
adayları için bağımsız çürütme (13 denetçi) → LOW/INFO elle.

## DOĞRULANAN

| # | Şiddet | Bulgu | Kanıt | Düzeltme |
|---|--------|-------|-------|----------|
| 1 | **HIGH** | **Kazandırma onayının fail-closed geri alması ÜRETİMDE HİÇ ÇALIŞMIYOR:** `@OnEvent("listing.award.approved")` opsiyonsuz kayıtlı; `@nestjs/event-emitter@3.1.0` dinleyiciyi `wrapFunctionInTryCatchBlocks` ile sarıyor ve `options?.suppressErrors ?? true` → hata **yutuluyor**, `emitAsync` başarı dönüyor. Onay servisi bu sonuca güvenip rollback yapıyor → o `catch` bloğu ölü kod. Sonuç: onay **APPROVED**, sipariş **YOK**, ilan `IN_AWARD_APPROVAL`'da **donuyor**, `company.approval.approved` **kritik audit izi yalan yazılıyor**, başlatana "onaylandı" bildirimi gidiyor. Kurtarma ürün içinde imkânsız (`award` OPEN/IN_AWARD ister, `cancelRequest` PENDING ister, admin `reopenListing` CLOSED/IN_AWARD ister) → elle DB müdahalesi. Testler kaçırmış: spec'ler dinleyiciyi ham `events.on(...)` ile kaydedip Nest sarmalayıcısını baypas ediyor | `company-listings.service.ts:5440`; `company-approvals.service.ts:850-897`; `node_modules/@nestjs/event-emitter/dist/event-subscribers.loader.js` | `*.approved` dinleyicilerine `{ suppressErrors: false }`; `*.rejected` (emit ile, beklenmez) kendi try/catch + Sentry; metadata sözleşme testi |
| 2 | MED | **İlan sahibi GÖNDERİLMEMİŞ (DRAFT) tekliflerin belgelerini görüyor** — teklifçi firma adı + presigned indirme URL'i dahil. Belgeler zaten yalnız DRAFT'ta yükleniyor (akış: taslak kaydet → belge yükle → gönder), yani pencere istisnai değil normal. İlan detayının sahip dalı DRAFT'ı gizlerken kardeş uç gizlemiyor | `company-bid-documents.service.ts:184-190`; karşılaştırma `company-listings.service.ts` sahip dalı | tek kaynak `OWNER_VISIBLE_BID_STATUSES` (SUBMITTED/WON/AWARDED_PARTIAL/LOST); iki yol da ondan okur |
| 3 | MED | **RLS aktivasyonunda kırılacak 3 yol** (bugün etkisiz — RLS prod'da kapalı): (a) cron→servis sıçraması: `notifyListingClosed`/`notifyListingInvitees` ANA client'la `listing_invitations`+`listing_bids` okuyor → bağlamsız cron'da 0 satır → kapanış/hatırlatma/yeni-tur bildirimleri sessizce gitmez; (b) `review-summary` zorunlu `order` ilişkisi çapraz-firma → policy gizleyince `latest.order.buyerCompanyId` TypeError (500); (c) WS ağ geçidi tenant bağlamı kurmadan policy'li tabloları okuyor → tüm abonelikler reddedilir | `listing.scheduler.ts:85,145,219`; `review-summary.ts:24,60`; `realtime.gateway.ts:199-231` | (a) okumalar ilan SAHİBİ bağlamında (`inOwnerContext`); (b) rol türetimi null-toleranslı (kalıcı çözüm: `reviewerRole` kolonu — Dalga B); (c) erişim kontrolleri `runWithTenantContext` içinde |
| 4 | MED | **Pano geliri/tasarrufu yanlış para biriminden çevriliyor:** `satisStats` `CompanyOrder.currency`'yi SELECT bile etmiyor, ilanın `primaryCurrency`'sini kullanıyor (öksüz siparişte "TRY" varsayıyor); `satinalmaTasarruf` kazanan teklifin birimini çekip kullanmıyor ve ilan birimindeki `targetPrice` ile teklif birimindeki `unitPrice`'ı çevrimsiz çıkarıyor. `allowedCurrencies` boşken teklif herhangi bir birimde verilebildiği için ayrışma sıradan (ör. TRY ilan + 100 USD sipariş → 100 ₺ sayılıyordu) | `company-dashboard.service.ts:226-231, 265, 457-472` | sipariş kendi `currency`'sinden; tasarrufta iki taraf AYRI kurla TRY'ye çevrilir, etiket TRY |
| 5 | LOW | **`GET /company/reviews/company/:companyId` kapısız** — ilişkisiz/paketsiz çağıran, profil sayfasında 404 alacağı firmanın değerlendirme özetini (opt-in veren ortakların FİRMA ADLARI + yorumlar) okuyabiliyor. Etki dar (uç hiçbir istemcide çağrılmıyor, iç cuid gerekiyor) ama kardeş uçla asimetrik | `company-reviews.controller.ts:59-62`; `company-reviews.service.ts:109-117` | `getProfile` ile aynı kapı (ilişkili VEYA herkese-açık dizin kaydı; aksi 404) |
| 6 | LOW | **Mesaj bildirimi CTA'sı GÖNDERENİN portalına gidiyor** — alıcının portalı daima tersidir; alıcıda o portal yoksa (SILVER-altı tedarikçi ↔ satınalma portalı) link Premium/erişim ekranına düşüyor | `company-messages.service.ts:82-84, 379-381` | portal-bağımsız birleşik gelen kutusu (`/company/mesajlar?with=…`) |
| 7 | LOW | **İzin override'ı okuma tarafında katalogla kesiştirilmiyor** — yazma yolu katalog dışını 400'lerken `hasCompanyPermission` `added` içindeki her anahtarı kabul ediyor (Faz R-1 öncesi legacy `buy:*`/`sell:*` satırları). OWNER_ONLY iddiası **çürük** (bu anahtarlar katalogda hiç yok) | `company-permissions.constants.ts:152-164` | `added` ∩ `ALL_COMPANY_PERMISSIONS`; `removed` filtrelenmez (fail-closed) |
| 8 | LOW | **Pano analitiği Faz O dar-bağlam kapısız** — ONAYLAYICI-only/rolsüz üye, ilan detayında 404 alırken `satinalma/analytics` yanıtında AÇIK tedarikçi adı + teklif sayısı + kazanma oranı görüyor. (Karşı-portal ve tier dalları çürütüldü: SATISCI zaten FULL_READ; tier = paywall, sızıntı değil) | `company-dashboard.controller.ts:71-79`; `dashboard-analytics.service.ts:440-447` | Faz O tek kaynak `hasFullReadContext`; dar bağlamda tedarikçi adı maskelenir (uç kapatılmaz) |
| 9 | LOW | **KVKK dökümü audit izsiz + fazla alan:** kardeş uç (`deleteOrAnonymize`) audit'liyken export izsiz; `users` projeksiyonsuz döndüğü için TOTP ciphertext'i, kurtarma kodu hash'leri, `authId`, `tokenVersion`, `permissionsOverride` ve iç `adminNotes` dökümde yer alıyor ("parola hash'i" iddiası **yanlış** — Supabase'te) | `admin-companies.service.ts:1470-1540` | `admin.company.exported` audit (satır sayıları, ham PII yok) + `omit` projeksiyonu + `adminNotes` dökümden çıktı |
| 10 | LOW | **Dış ihale daveti e-postası redaksiyon listesinde değil** — `CompanyReferralInvite.token` `EmailLog.payload`'ında düz metin, admin panelinde görünüyor; aynı token'ı taşıyan `referral_invite` redakteli (kodun kendi ölçütüyle çelişki). Etki dar: token e-postaya bağlı (kabul, kayıt olanın adresine göre filtreleniyor) | `email.service.ts:35-45` | `tender_external_invite` redaksiyon listesine + regresyon testi |

## ÇÜRÜTÜLEN / BİLİNÇLİ TASARIM

- **Onay isteği iptali ilan-yönetim kapısız** → DESIGN_DECISION: yönetimsel aksiyonlar Kurucu/Yönetici'ye serbest, ticari/bağlayıcı aksiyonlar izin∧oluşturan kapısında (servis yorumu + `approvals.spec.ts:264` sözleşmesi). Geri alınabilir, para değişmez.
- **SALES firma askıya alabiliyor** → DESIGN_DECISION: "Çöz & Askıya Al" şikayet moderasyonunun parçası (`via:"complaint"` audit damgası, `docs/audit-findings-authz.md:48`). Tek pürüz: SALES askıya alabiliyor ama geri alamıyor (asimetri yazılı değil) → Dalga B.
- **Keşfet/AI keşfi `publicEnabled` filtresi yok** → DESIGN_DECISION: bayrak "profil SAYFAM yayında mı" demek, "platformda görünür müyüm" değil; eşleşme yüzeyleri tier+kategori ekseninde çalışır. Kalan: `publicEnabled=false` hedefe link verildiğinde 404 çıkmazı (UX) → Dalga B.
- **Pano tier kapısı yok** → paywall aşımı, veri sızıntısı değil → Dalga B.

## DALGA B (doğrulanan LOW/INFO)

- `SupplierTemplate.isPublic` hiçbir sorguda uygulanmıyor (kutu sessizce etkisiz); `assertOwnProfileImageUrl` URIError → 500; `companyBlock.upsert` P2002 yarışı.
- `assertCanGrantRoles` delta yerine mutlak rol kümesine bakıyor; `updateUser` rolsüz dalında hedef-koruması + audit yok; onaycı uygunluğu atamada ROL/kararda İZİN (rol değişirse adım kilitlenir); `resendInvitation` rol-verme kapısını yeniden uygulamıyor; `assertNotLastAdmin` sahipliği `roles` dizisinden okuyor.
- Admin ilan detayı `internalNotes`'u (firmanın iç notu) SUPPORT'a döküyor; ilan belgeleri ucunda DTO yok (400 yerine 500); `/company/approvals/all` izin kapısız (Faz O muafiyeti yazılı — INFO).
- RLS: `order_revision_items` policy'siz; mühürlemeden sonra eklenen 4 tenant tablosu policy'siz; `store.inTx` istek-genelinde tek bayrak. **Bypass envanteri temiz** (14 nokta, kullanıcı isteğinde meşru olmayan kullanım YOK); ham SQL enjeksiyona kapalı.
- Admin: UI rol matrisi admin-system/inspection/sidebar'ı kapsamıyor; denetim kaydı aktör filtresi bayat; 2FA hiçbir rolde zorunlu değil; admin profil düzeltmesi IBAN'ı audit metadata'sına maskesiz yazıyor; KVKK silme Supabase hesabını yerel işlemden önce siliyor.
- WS ilan odası aboneliği PRIVATE ilanda "bağlı olmayı" yeterli sayıyor (listing-visibility tek-kaynağından drift); AI keşfi ham `Company.tier` (INV-TIER-1 driftı).
- Kazandırma→sipariş: tasarruf raporu kalem-bazlı kazandırmayı görmüyor (yalnız `WON` + tam miktar); yetim PENDING onay isteği (istek commit'inden sonra CAS başarısızsa); `APR-YYYY-NNNN` sayacı 9999'dan sonra kalıcı P2002; teklif geçerliliği kazandırma anında doğrulanmıyor (INFO); `awardByItem` doküman driftı (SATIS'ta da kalem-bazlı kazandırma açık).
- Pano analitiği cache'i istemci-kontrollü anahtarla sınırsız büyüyor (LRU/kapasite sınırı yok) + `TimeSavingsService.invalidate()` hiç çağrılmıyor.
- `review-summary` kalıcı çözümü: `CompanyReview.reviewerRole` kolonu (migration + backfill) — bugünkü null-toleransın yerine.

## DAVRANIŞ DEĞİŞİKLİĞİ (dikkat)

#7'nin (override ∩ katalog) yan etkisi: **Faz R öncesi yazılmış legacy
`permissionsOverride.added` satırları artık işlem yetkisi VERMEZ.** Yazılı kural
zaten buydu (`company-permissions.constants.ts`: "işlem izinleri katalogdan
ÇIKARILDI — override ile verilemez/alınamaz; işlem yetkisi = rol ata/kaldır") ve
yazma yolu böyle bir override'ı 400'lüyor; okuma yolu kabul ettiği için kural
delinmişti. Bayat sözleşme testi (`company-listings.spec.ts` "kişi-bazlı izin
override ile verilen yetki tanınır") kuralın TERSİNİ sabitliyordu — güncel kurala
göre yeniden yazıldı (override yerine ROL atanır).

**Dalga B veri kontrolü:** canlıda `company_users.permissionsOverride->'added'`
içinde `buy:*`/`sell:*` anahtarı taşıyan satır var mı bakılmalı; varsa o
kullanıcılara ilgili ROL atanmalı (aksi halde bu kişiler ilan yönetimi yetkisini
kaybeder). Sorgu: `SELECT id, "companyId", "permissionsOverride" FROM company_users
WHERE "permissionsOverride"->'added' ?| array['buy:listing:manage','buy:listing:create','sell:listing:manage','sell:listing:create','buy:award','sell:award','buy:order:manage','sell:order:manage','buy:bid:review','sell:bid:submit'];`

## DURUM

- **Dalga A UYGULANDI (2026-08-24):** #1-#10. Yeni tek-kaynaklar: `common/company/full-read-context.ts` (Faz O), `OWNER_VISIBLE_BID_STATUSES` (bid-items.ts), `inOwnerContext` (listings servisi).
- Testler: `test/unit/onevent-fail-closed.spec.ts` (3, metadata sözleşmesi), `test/integration/audit-part4-dalga-a.spec.ts` (6), `email-redaction.spec.ts` +1.
- Parça 3'ten sarkan **kazandırma→sipariş merceği bu turda tamamlandı** (bulguları Dalga B listesinde).
