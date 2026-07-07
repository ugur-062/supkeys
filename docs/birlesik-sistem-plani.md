# Birleşik Sistem (Tek Company) — Uygulama Planı

> **Durum:** Tasarım onaylandı (2026-06-25). Henüz kod yok — bu doküman yapım başlamadan önceki tam yol haritası.
> **Yaklaşım:** Mevcut ayrı alıcı/tedarikçi sistemini tek hesaba **evirme** (sıfırdan değil). İş mantığının %70-80'i yöne kayıtsız ve çalışıyor; sadece hesap/auth/panel katmanı birleşir. Köprü/kademeli geçiş — ürün hep ayakta.

---

## 1. Vizyon & ilkeler

- **Tek `Company` hesabı.** Bir firma hem alır hem satar. "Alıcı firma / tedarikçi firma" diye **hesap tipi yok.**
- **Rol her İŞLEMDE belirlenir**, hesapta sabit değil.
- **Mod tuşu yok.** Tek panel; alım/satım ayrımı kişinin **rolüyle** otomatik + her satırda renk etiketi.
- **Sipariş her zaman satıcı→alıcı'ya normalleşir** → kargo/ödeme/belge tek akış, tekrar yok.
- **Gelir = sadece abonelik.** Güvenli ödeme (escrow) **YOK**, platform para tutmaz.

---

## 2. Gelir modeli

- **Tek paket aylık abonelik.** Aktif yetenekleri açar (ilan aç + keşfet + public).
- **Escrow / güvenli ödeme KALDIRILDI.** Platform para tutmaz/işlemez. Ödeme **taraflar arası direkt** (havale). Sipariş akışındaki **dekont (ödeme kanıtı) kaydı korunur** — bu escrow değil, sadece "ödedim" belgesi.
- **Komisyon yok.** (Escrow olmadığı için işlem-başı kesinti yok.)
- **Bonus:** sanal POS / KYB / ödeme regülasyonu yükü tamamen kalkar.
- Kullanıcı/koltuk başına ücret **YOK** → sınırsız kullanıcı/rol.
- (İleride opsiyonel: özellik-kademeli paketler — Başlangıç/Pro. Şimdilik tek sade paket.)

---

## 3. Temel varlıklar (5 parça)

| Yeni | Birleştirir | Özet |
|---|---|---|
| **Company** | Tenant + Supplier | Tek firma: kimlik, doğrulama (KYC), adres, üyelik, kategoriler (alır + satar) |
| **CompanyUser** | User + SupplierUser | Tek kullanıcı + roller (aşağıda) |
| **CompanyConnection** | SupplierTenantRelation | Firma↔firma bağlantı (yönlü: davet eden / edilen) |
| **İlan** | Tender (genelleşir) | `tip`: ALIM / SATIŞ |
| **Sipariş** | Order | Hep `satıcıFirma → alıcıFirma` (kazanınca atanır) |

---

## 4. Roller (kişi seviyesi)

**4 rol — bir kullanıcı birden çok alabilir:**

| Rol | Yetki | Görür |
|---|---|---|
| 🛠 **Yönetici** | Firma ayarları, kullanıcı + rol atama, üyelik/abonelik, bağlantılar. (Hesap sahipliği.) | Her şey |
| 🔵 **Satın Almacı** | Alım operasyonu: alım ilanı aç, teklif topla, kazandır; alım siparişi (öde/teslim al); satış ilanlarına teklif ver (mal alımı) | Sadece alım tarafı |
| 🟢 **Satışçı** | Satış operasyonu: alım ilanlarına teklif ver (satış); satış ilanı aç, kazandır; satış siparişi (kargola) | Sadece satış tarafı |
| ✅ **Onaylayıcı** | Onay zincirinde onay (ilan/kazandırma/sipariş) | Onayına düşenler |

**Kurallar:**
- **İlk kayıt olan = Yönetici + Satın Almacı + Satışçı** (solo firma her şeyi yapsın). Yönetici = hesap sahipliği, meslek değil — bir satın almacı kaydolursa "Yönetici + Satın Almacı" olur.
- Yönetici ekibi **davet eder + rol atar** (Ali=Satın Almacı, Ayşe=Satışçı, …).
- **Tek rollü kişi sadece kendi tarafını görür** → panel kendiliğinden temiz + yetki ayrımı (sorumluluk ayrımı).
- **Sahiplik devredilebilir:** Yönetici başkasını Yönetici yapıp çekilebilir; **birden çok Yönetici** olabilir.

**İki katman (karıştırma):**
- **Üyelik** (firma) = firma **neyi** yapabilir (pasif/aktif).
- **Rol** (kişi) = firmanın izinli kümesinde kişi **hangi tarafı** yapar.

---

## 5. Üyelik (pasif/aktif) + görünürlük

| Yetenek | Standart (bedava) | Tek Paket (paralı) |
|---|---|---|
| **Herkese açık (PUBLIC) ilanları GÖR** | ✅ ama **MASKELİ** (kim açtı + iletişim gizli) | ✅ tam (kim açtı + iletişim görünür) |
| **Herkese açık ilana teklif ver** | 🔒 (premium gerekir) | ✅ |
| **Bağlantılı firmanın ilanını gör + teklif** (🔵alış + 🟢satış) | ✅ | ✅ |
| Kazandığı siparişi yürüt (kargola/öde) | ✅ | ✅ |
| Firma profili + kullanıcı/rol yönetimi | ✅ | ✅ |
| Bağlantı isteği gönder / al / kabul | ✅ | ✅ |
| **Kendi ilanını aç (alım/satış)** | 🔒 | ✅ |
| **Keşfet / firma-ilan arama** | 🔒 | ✅ |
| **Diğerlerine görünür / havuzda çıkma** | 🔒 görünmez | ✅ |
| **Herkese açık profil** (`/firma/[slug]`) | 🔒 yok | ✅ |
| Kullanıcı/rol sayısı | sınırsız | sınırsız |

**İlan görünürlük seviyeleri (alış + satış için aynı):**
- **PUBLIC (herkese açık):** herkes görür — ama **Standart MASKELİ** görür (kim açtı + iletişim gizli, "kilitli teaser" + upgrade CTA). Teklif vermek için premium.
- **BAĞLANTILARA açık:** yalnızca açan firmanın **bağlantılı** firmaları görür.
- **ÖZEL/davetli:** sadece açıkça davet edilenler.

**Bağlantı kuralı:** **Bir firma davet atar, diğeri kabul eder** → bağlanır (tek yönlü davet → kabul; karşılıklı davet değil). Bağlanınca birbirinin "bağlantılara açık" ilanlarını görür + teklif verebilir (alış+satış).

**⚠️ Premium düşüş kuralı (eski sistemdeki gibi — alış+satış için korunacak):** Bir firma **PAKET→STANDARD** düşerse:
- **Referans-kodlu / davet-kabul** bağlantıları **KALICI** (etkilenmez, görmeye devam eder).
- **Premium kaynaklı** (keşif/havuz üzerinden kurulan) bağlantıları **PASİFE** alınır → o firma onları **göremez**. Tekrar premium olunca geri gelir.
- (Eski: `SupplierTenantRelation` INVITE/ADMIN kalıcı ↔ CONNECT_REQUEST premium-gated. → `CompanyConnection.origin`: REFERENCE/INVITE=kalıcı, PREMIUM=premium-gated.)

- Mevcut **PREMIUM-only public profil** + **STANDARD davetli-görünürlük** mantığının firma seviyesine taşınması — sıfırdan değil.

---

## 6. Kayıt & onboarding

1. Firma **self-servis** kayıt (bedava standart). Form: firma bilgisi + ilk kullanıcı.
2. İlk kullanıcı = **Yönetici + Satın Almacı + Satışçı**.
3. Onboarding (mevcut 3-aşamalı madde-29 akışı): kimlik/vergi (ülke-farkında) → kategoriler (**ayrı: ne alırım / ne satarım**) → KYC belgeleri → admin doğrulama.
4. Yönetici ekibi davet eder + rol atar.
5. **Alıcılık/aktiflik = paralı upgrade** (ilan açma + keşfet + görünürlük). Bedava kalırsa pasif/kapalı balon.
6. (Eski "alıcı davetle gelir" zorunluluğu kalkar — herkes self-servis girer; davet akışı opsiyonel bağlantı kanalı olarak kalır.)

---

## 7. İlan tipleri + sipariş normalleşmesi

- **ALIM ilanı:** açan **alır** · teklif **iner** · **en ucuz** kazanır · gönderen = **kazanan teklifçi**.
- **SATIŞ ilanı** (mal fazlası): açan **satar** · teklif **çıkar** · **en yüksek** kazanır · gönderen = **ilanı açan**.
- Kazanınca **Sipariş = satıcı→alıcı** atanır:
  - ALIM → satıcı = kazanan, alıcı = açan.
  - SATIŞ → satıcı = açan, alıcı = kazanan.
- Bundan sonrası **mevcut sipariş akışıyla aynı** (kargo, irsaliye/konşimento, dekont, teslim). **Hiç ters çevirme/tekrar yok.**
- Açık eksiltme altyapısı (İngiliz Usulü) + **yön bayrağı** ile yeniden kullanılır.

---

## 8. Panel — "İşlerim", mod tuşu yok

- **Açılış = İşlerim** aksiyon akışı: yapılacaklar, aciliyete göre, her satır 🔵/🟢 etiketli, **role göre otomatik süzülmüş.**
- **Menü:** İşlerim · İlanlar · Teklifler · Siparişler · Keşfet(🔒) · Mesajlar · Ayarlar · `+Yeni İlan`(🔒 → "Alım mı Satış mı?" seç).
- **Ekranlar role göre render** (paylaşılan bileşenler): `BidForm`, `BidInbox` (topla+kazandır), `ShipPanel` (kargo+belge), `PayPanel` (öde). Her biri **"bu işlemdeki rolüm"e** göre.
- Listelerde **opsiyonel hafif filtre** (Tümü/Alış/Satış, varsayılan Tümü) — sticky mod değil, güç-kullanıcı içindir.
- Tek rollü kullanıcı zaten yalnızca kendi tarafını görür → filtre çoğu kişiye gereksiz.

---

## 9. Veri modeli — çakışmalar & çözüm

| Çakışma | Çözüm |
|---|---|
| İki kullanıcı sistemi: User(rol) vs SupplierUser(isManager) | Tek **CompanyUser** + 4 rol |
| Kategoriler **ters anlam** (alıcı=ne alırım / satıcı=ne satarım) | **Ayrı:** `buyerCategoryIds` + `sellerCategoryIds` |
| İki üyelik modeli (buyerSeatLimit/membershipEndAt vs membership enum) | Tek üyelik: `tier` (STANDART/PAKET) + `membershipEndAt`; koltuk yok |
| Bağlantı yönlü (SupplierTenantRelation) | **CompanyConnection** { buyerCompanyId? / inviter+invitee, status, origin } — yön per-ilan/işlem |
| Kendi-kendine işlem | Guard: `actorCompanyId !== ownerCompanyId` (kendi ilanına teklif/kendine bağlanma yasak) |
| Mod-geçişi veri sızıntısı | Tüm sorgular **companyId + rol** scope; kapalı zarf korunur |
| Auth 2 token | Tek **`company`** token (roller + üyelik claim'leri) |
| Adres: TenantAddress (tipli) vs supplier inline | Tek **Address** defteri (TenantAddress genelleşir) |
| rothernId ikisinde de var | Tek Company.rothernId |
| Banka/sertifika (supplier'da zengin) | Company seviyesine taşınır |

**FK migration (en riskli):** `bid.supplierId`, `invitation.supplierId`, `order.tenantId/supplierId`, ilişkiler → **companyId** (sipariş: `sellerCompanyId`/`buyerCompanyId`). Kademeli: Company kur → veri taşı → FK repoint → eski tabloları deprecate. **Staging'de prova zorunlu.**

---

## 10. Auth

- İki strateji (`type:"tenant"` / `type:"supplier"`) → tek **`type:"company"`** token. İçinde: `companyId`, `userId`, `roles[]`, `tier`.
- Tek login, tek store (`rothern-auth`), tek axios. Admin (`type:"admin"`) **ayrı kalır.**
- Permission guard'lar: "panel tipi" değil **"işlemdeki rol + firma üyeliği"** ile.

---

## 11. Yapım sırası (fazlar)

1. **Faz 1 — Company + CompanyUser + roller + migration.** (En büyük, en riskli.) Şema, veri taşıma, FK repoint.
2. **Faz 2 — Auth birleştirme.** Tek company token + login + store + guard'lar.
3. **Faz 3 — İlan/Sipariş genelleştirme.** `tip` alanı (ALIM default = mevcut davranış) + sipariş satıcı/alıcı normalleşmesi.
4. **Faz 4 — Tek panel.** İşlerim akışı + role-göre ekranlar (paylaşılan bileşenler) + filtre.
5. **Faz 5 — Satış ilanı (forward auction).** Yön bayrağı; her şey hazır olduğu için küçük ek.
6. **Faz 6 — Üyelik gate.** Pasif/aktif + görünürlük (kapalı balon) + abonelik akışı.

> Her faz ürünü ayakta tutmalı (köprü). Faz 1 bitmeden Faz 3'e geçilmez (FK'ler companyId olmalı).

---

## 12. Korunan vs değişen (evrim, sıfırdan değil)

**✅ Aynen kalır (yöne kayıtsız):** İhale wizard, bid/eleme/kazandırma, sipariş akışı + PDF, kargo/irsaliye/konşimento, dekont, UNSPSC kategori sistemi, e-posta (React Email+Resend), mesajlaşma, R2 upload, multi-currency, Catalyst UI, şablonlar, admin + KPI, RBAC/IDOR güvenlik, testler.

**🔧 Değişir (hesap katmanı):** Tenant+Supplier→Company · User+SupplierUser→CompanyUser · 2 auth→1 · kategoriler ayrışır · sipariş FK'leri company'ye · 2 panel→1 (İşlerim + roller) · koltuk kalkar · escrow kalkar.

---

## 13. Kaldırılanlar / ertelenenler

- **Escrow / güvenli ödeme:** kaldırıldı. Ödeme taraflar arası direkt; sadece dekont kaydı.
- **Koltuk başına ücret (`buyerSeatLimit`):** kaldırıldı; sınırsız kullanıcı.
- **Alıcı davetle-kayıt zorunluluğu:** kalkar (herkes self-servis).
- **Özellik-kademeli paketler:** ertelendi (tek sade paketle başla).
- **i18n / VIES / açık ihale başvuru:** ayrı backlog (bu pivottan bağımsız).

---

## 14. Moderasyon & Güven (backlog — sonra yapılacak)

### 14.1 Şikayet / talep sistemi
- Bir firma, başka bir firma hakkında **şikayet/talep** oluşturabilir (sebep + açıklama, opsiyonel ek/kanıt).
- Şikayetler **platform admin'e düşer** (admin panelinde liste + inceleme).
- **Eşik:** bir firma hakkında **çok şikayet** birikirse → hesap **askıya alınır** (eşik aşılınca admin'e uyarı + admin kararı veya oto-askı).
- Model taslağı: `CompanyComplaint { reporterCompanyId, targetCompanyId, reason, description, status (OPEN/REVIEWING/RESOLVED/DISMISSED), createdAt, resolvedById }`.
- Askı durumu: `Company.suspendedAt` (+ sebep) — askıdaki firma giriş yapamaz / işlem yapamaz; admin kaldırabilir.

### 14.2 Şirket engelleme (company block)
- Firma A, firma B'yi **engelleyebilir.**
- Engellenince **B, A'yı HİÇBİR ŞEKİLDE bulamaz:** arama/keşfet/havuz/public profil — hepsinde A, B'ye görünmez. Etkileşim (ilan daveti, teklif, bağlantı) engellenir. (Karşılıklı görünmezlik.)
- **Engelleyen (A) isterse engeli kaldırır.**
- Model taslağı: `CompanyBlock { blockerCompanyId, blockedCompanyId, createdAt }` + `@@unique([blockerCompanyId, blockedCompanyId])`.
- Uygulama: tüm keşif/arama/listeleme/davet sorgularına **"engelli ilişki hariç"** filtresi (tier görünürlük filtresinin üstüne). Mevcut bağlantı varsa engelle birlikte pasifleşir.

---

## 15. Açık/ileride netleşecek detaylar

- Onaylayıcı rolünün satış tarafında da olup olmayacağı (örn. satış kazandırma onayı).
- CompanyConnection'ın tam alan seti (kim daveti başlattı, blok, vb.).
- Abonelik ödeme entegrasyonu (escrow yok ama abonelik tahsilatı için yine bir sağlayıcı gerekebilir — Iyzico/Stripe **sadece abonelik** için, escrow değil).
- Mevcut demo verisinin migration'da nasıl ele alınacağı.
- Şikayet eşiği kaç olmalı + oto-askı mı admin-kararı mı (14.1).
