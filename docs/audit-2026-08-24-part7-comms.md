# Denetim 2026-08-24 — Parça 7: Bağlantı, Mesaj, Bildirim, WebSocket

Yöntem: 7 mercek paralel bulgu toplama (64 ham bulgu: bağlantı yaşam döngüsü,
mesajlaşma, in-app bildirim, e-posta yolları, WS, tercihler/kategori eşleşmesi,
blok-gizlilik tutarlılığı) → tekilleştirme → 11 bağımsız çürütücü → LOW/INFO elle.

## DOĞRULANAN

| # | Şiddet | Bulgu | Kanıt | Düzeltme |
|---|--------|-------|-------|----------|
| 1 | MED | **"Geçerli bağlantı" tek kaynaklı değildi:** ilan tarafı bağlantıyı KURAN tarafın efektif BRONZ+ olmasını şart koşarken (`connectedCompanyIds`, INV-TIER-1), ilan BELGE servisi ve WS ağ geçidi düz `companyConnection.count({status:"ACTIVE"})` kullanıyordu → davet eden firma paketten düşünce ilan detayı 404 verirken **şartname/çizim dosyaları indirilmeye devam ediyordu** (2026-07-28'de kapatılan DRAFT/embargo kardeşleriyle aynı sınıf) | `company-listing-documents.service.ts:86-115`; `realtime.gateway.ts:240-251`; `company-listings.service.ts:7007-7040` | yeni tek kaynak `common/company/valid-connection.ts` (`isConnectionValid` / `hasValidConnection`); üç yol da ondan okuyor |
| 2 | MED | **Blok SONRASI ilan bildirimleri engellenen firmaya gitmeye devam ediyordu:** blok bağlantıyı siler ama blok ÖNCESİ oluşmuş `listingInvitation`/`listingBid` satırları kalıyor ve bildirim toplayıcıları blok süzgeci uygulamıyordu. En net kırık: hatırlatma ve yeni-tur hedefleri tanımı gereği "teklifi olmayan davetliler" | `company-listings.service.ts` `notifyListingClosed` / `notifyListingInvitees` | her iki toplayıcı `blockedCompanyIds` ile süzülüyor (kazandırma/eleme gibi BAĞLAYICI sonuç bildirimleri bilinçli kapsam dışı — karşı tarafı mağdur etmemek için) |
| 3 | MED | **Kategori duyurusu askıya alınmış firmaya gidiyordu** (`isBlocked: true` ama `isActive: true` kalan firmalar) — kardeş yüzeylerin (keşif, bağlantı, mesaj, JWT) hepsi bu süzgeci uyguluyor. Ayrıca `take: 300` flood-guard'ı **sırasız**: 300'ü aşan segmentte kimin haber alacağı tarama sırasına bağlıydı | `company-listings.service.ts` `notifyCategoryMatchedCompanies` | adaylara `isBlocked: false` + deterministik `orderBy: { createdAt: "desc" }` |
| 4 | LOW | **Değerlendirme özeti ucunda askı/blok kapısı yoktu:** P4'te eklenen "ilişkili VEYA herkese-açık" kapısı bloklu firmayı elemiyordu (blok bağlantıyı sildiği için `publiclyListed` dalından geçiyor) ve admin askısı yalnız `isBlocked` yazıp `publicEnabled`'ı bıraktığı için askılı firmanın özeti (opt-in ortak ADLARI + yorumlar) açık kalıyordu | `company-reviews.service.ts:118-140` | `isActive`/`isBlocked` + karşılıklı `companyBlock` kontrolü |
| 5 | LOW | **WS oda kapısı REST görünürlüğünü aynalamıyordu:** (a) PRIVATE ilanda davetsiz ama bağlantılı firma, (b) embargolu ilanda teklifi olmayan davetli/bağlantılı firma, (c) sahibince bloklanmış ama eski davet/teklif satırı duran firma odaya abone olup `listing.updated` ping'lerini dinleyebiliyordu. (Ping yalnız id taşır — yine de "bu ilanda hareket var" sinyali kapalı-zarf/embargo kararının dışına sızmamalı) | `realtime.gateway.ts` `canSubscribeListing` | blok kontrolü + embargoda yalnız teklifi olan + PRIVATE'ta yalnız davetli |

## ÇÜRÜTÜLEN / BİLİNÇLİ TASARIM

- **Keşfet uçlarında `publicEnabled` yok → dizin sızıntısı** → DESIGN_DECISION (P4'te karara bağlanmıştı): bayrak "profil SAYFAM yayında mı" demek; eşleşme/davet yüzeyleri tier+kategori ekseninde çalışır. Çürütücü finder'ın iki maddi hatasını da düzeltti: `discover` `anyPackageWhere()`'i **uyguluyor**, ve AI keşif kartı profil sayfasına link vermediği için orada 404 çıkmazı **yok**. Kolon `@default(false)` olduğundan filtre eklemek keşfi fiilen boşaltırdı.
- **Bildirim tercihi mimarisi kırık** → PARTIAL/LOW: tercihler kullanıcı bazlı ve in-app kanalda her kullanıcının kendi tercihi uygulanıyor; `billingEmail` dalının tercihleri baypas etmesi üç yerde yazılı bilinçli karar (alan yalnız admin tarafından doldurulabiliyor).
- **`inviteByEmail` frensiz + e-posta→firma oracle'ı** → PARTIAL/LOW: tier + izin + opt-out + IP throttle + bounce suppression var; `targetName` ürün gereği (kime istek attığını görmek) ve hedefe bildirim/audit üreten gürültülü bir aksiyon. Kalan gerçek kusur: `referral_invite` şablonunda opt-out linki yok.
- **Mesaj ucunda hız sınırı yok** → PARTIAL/LOW: global 100/dk/IP var. Gerçek kusur farklı: UI yeni sohbeti yalnız bağlantı/teklif/sipariş karşı tarafıyla açtırırken `send()` ilişki şartı koşmuyor.

## DALGA B (doğrulanan LOW)

- `referral_invite` e-postasında opt-out linki yok (`ReferralInviteData` tipinde alan bile yok) — dış ihale davetinde var, bu yolda yok.
- Mesaj gönderimi: API'de ilişki şartı yok (UI kilidi ≠ API kilidi); `discover` bağlantısız firma id'si döndürdüğü için hesap başına ~100 firmaya soğuk mesaj + 1:1 e-posta mümkün.
- `GET /notifications` sayfalama kabul etmiyor (sabit 30) → 30'dan eski bildirim hiçbir yüzeyden görülemiyor; portal sekmesi bu pencere üzerinde istemci tarafında filtreleniyor.
- Suppress edilmiş adreste `EmailService.send()` başarı şekli döndürüyor → P1'de eklenen dürüst-sinyal (`emailSent` / 2FA 503) devre dışı kalıyor, "kod gönderildi" yanıltıcı olabiliyor.
- Kategori duyurusunda 300'e kadar e-posta fire-and-forget gönderiliyor (eşzamanlılık sınırı/retry yok); eşleşme pratikte segment (L1) genişliğinde.
- AI keşfinde ham `Company.tier` (INV-TIER-1 driftı) ve Bağlantılar/Keşfet kartının `publicEnabled=false` hedefte 404 çıkmazı — ikisi de P4 Dalga B'de kayıtlı, hâlâ açık.
- Okunmamış mesaj rozeti aktif portala bağlı (birleşik gelen kutusu kararıyla gerilim).
- WS handshake throttle dışı (eşzamanlı soket sınırı yok).

## DURUM

- **Dalga A UYGULANDI (2026-08-24):** #1-#5.
- Yeni tek-kaynak: `common/company/valid-connection.ts`.
- Testler: `test/integration/audit-part7-dalga-a.spec.ts` (6); mevcut realtime/visibility/documents spec'leri yeşil.
