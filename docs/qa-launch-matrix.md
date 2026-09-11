# Yayın öncesi QA matrisi (2026-09-11)

Ortam: **staging** (`staging.rothern.com`, `admin.staging.rothern.com`). Hesaplar:
`uguray156+qa-<slug>@gmail.com` / `Staging1234!` (`seed-staging-roles`). Admin:
`uguray156@gmail.com` (Render `INITIAL_ADMIN_PASSWORD`).

Hücre değerleri: `✅` geçti · `❌ #n` bulgu (docs/qa-punchlist.md) · `—` rol için geçerli değil · boş = henüz bakılmadı.
Otomatik (Playwright/curl) koşan satırlar `🤖` ile işaretli; kalanı elle.
Staging e2e: `pnpm --filter @rothern/web e2e:staging` (74 test, 2026-09-12 tümü yeşil; demo veri `seed-marketplace-demo` ile; admin adımları `render.staging.env` `INITIAL_ADMIN_PASSWORD` + `STAGING_VERCEL_BYPASS_ADMIN` ister).

## Parça 1 — Ziyaretçi yüzü (giriş yok)

| Akış | Durum | Not |
|---|---|---|
| 🤖 Anasayfa açılır; Alıcıyım/Tedarikçiyim anahtarı; Ürün \| Firma pili | ✅ | canlı, 2026-09-11 (home-faces birim + curl) |
| 🤖 Üst menü: Ürünler, Firmalar, Alım Talepleri, Nasıl Çalışır, Fiyatlar | ✅ | public-header.spec canlıda 3/3 (390 px dahil) |
| 🤖 /urunler süzgeçler URL'ye yazılır; sayfalama; kategori sayfası | ✅ | public-products-filters.spec 2/2 (grup adı Şehir→Konum, test güncellendi) |
| 🤖 /firmalar süzgeç + şehir sayfası | ✅ | public-lists-filters.spec |
| 🤖 /alim-talepleri liste + talep detayı (sahip adı YOK, teklif sayısı YOK) | ✅ | public-lists-filters.spec + public-marketplace.spec (API) |
| Ürün sayfası: fiyat/MOQ, "Bilgi iste" → kayda yönlenir | | |
| Firma profili: sameAs, ürün şeridi, "Bağlantı iste" → kayda | | |
| 🤖 robots/sitemap/llms.txt; OG görselleri 200 | ❌ #1 | seo:audit: /nasil-calisir + sözleşmeler og:image yok, sözleşme JSON-LD yok, kategori/ürün başlığı >75, kısa firma açıklaması → düzeltmeler main'de, canlıya çıkınca yeniden koşulacak |
| 🤖 Kayıt formu → doğrulama kodu → 3 adımlı onboarding → panel | ✅ | staging-signup.spec (kod veritabanından çözülür, firma/kullanıcı/Supabase hesabı test sonunda silinir) |
| Şifremi unuttum akışı | | |

## Parça 2 — Kurucu (alıcı firma, Gold, doğrulanmış)

| Akış | Durum | Not |
|---|---|---|
| 🤖 Giriş → panel; portal anahtarı Satınalma/Satış | ✅ | company-tenders.spec staging (QA kurucu) |
| 🤖 **12 QA hesabının TAMAMI giriş formundan girer**; üst çubukta doğru kişi/firma, oturum yenilemeye dayanır | ✅ | staging-role-logins.spec |
| 🤖 Ayarlar › Firma Bilgileri: kimlik salt-okunur, ad/unvan kilitli | ✅ | staging-roles.spec |
| Ayarlar › Kullanıcı Yönetimi: davet, yetki tablosu, koltuk sayacı | | |
| Ayarlar › Adres, Banka, 2FA, Bildirimler | | |
| Şirketim › Profil: logo/kapak yükleme, kaydet, herkese açık görünüm | | R2 |
| 🤖 Doğrulama Belgeleri: 6 belge yükleme + başvuru (admin Başvurular kuyruğunda görünür) | ✅ | staging-admin.spec (ücretsiz QA firması üzerinden; API yükleme, admin tarayıcı) |

## Parça 3 — Satın alma zinciri (alıcı ↔ tedarikçi)

| Akış | Durum | Not |
|---|---|---|
| Hızlı talep: kalemler, adres, süre, kime (PUBLIC) → yayınla | | |
| Detaylı sihirbaz 4 adım; taslak; kopya | | |
| 🤖 **Pazarlık (açık eksiltme)**: RFQ → "Pazarlığa Geç" (tarayıcı) → monotonluk, taslağa çekilememe, kimlik gizliliği | ✅ | staging-negotiation.spec |
| 🤖 **Onay akışı**: kazandırma onaya düşer, onaylayıcı dar bağlamı görür, onaydan sonra sipariş | ✅ | staging-approval-flow.spec |
| 🤖 **Yazma yetkisi matrisi**: 9 rol × 33 POST ucu (boş gövde, kayıt oluşmaz) | ✅ | staging-role-writes.spec |
| 🤖 **Firmalar arası yalıtım**: taslak talep, ürün vitrini, sipariş, adres, kullanıcı — id ile açılamaz | ✅ | staging-tenant-isolation.spec |
| 🤖 **Kendi yetki satırı**: yönetici kendi iznini düzenleyemez; başka firmanın kullanıcısına yazamaz | ✅ | staging-tenant-isolation.spec |
| 🤖 Tedarikçi (satışçı) açık talebi görür, **Teklif Ver** ilk ekranda | ✅ | staging-order-chain.spec |
| 🤖 Teklif formu: kalem fiyatı, teslim süresi, geçerlilik → gönder | ✅ | staging-order-chain.spec (onay penceresi dahil) — ❌ #4 pencere metni düzeltildi |
| 🤖 Alıcı teklifleri görür; tedarikçiler birbirini GÖRMEZ | ✅ | kazandırma UI + API sözleşmeleri (closed-envelope spec) |
| 🤖 Kazandırma → sipariş oluşur | ✅ | staging-order-chain.spec (onay akışı tanımlı değilken doğrudan); onay akışlı varyant elle |
| 🤖 Sipariş: satıcı onaylar → gönderir → alıcı teslim alır (otomatik tamamlanır) → ödeme bildir/onayla | ✅ | staging-order-chain.spec |
| 🤖 E-postalar: teklif, kazandırma, sipariş adımları | ✅ | EmailLog: zincir boyunca 32 bildirim SENT, 0 FAILED (Parça 7) — Gmail'de içerik kontrolü elle |

## Parça 4 — Satış zinciri

| Akış | Durum | Not |
|---|---|---|
| 🤖 Ürünlerim: ürün ekle, görsel (R2 presigned PUT + resolve), anahtar kelime → onaya gönder; Onay bekliyor; inceleme kilidi 409 | ✅ | staging-sales-chain.spec (kayıt API, liste tarayıcı); 5 bölümlü form elle |
| 🤖 Admin: /admin/urunler kuyruğu → "Onayla ve yayınla" → herkese açık ürün sayfası 200 | ✅ | staging-sales-chain.spec (admin tarayıcı + ziyaretçi sayfası) |
| 🤖 Yayındaki ürünü düzenle → yeniden PENDING, vitrinde kalır | ✅ | staging-sales-chain.spec (API + herkese açık sayfa 200) |
| 🤖 Bilgi talebi (üye) → satıcı yanıtlar; Silver satıcı alıcı kimliğini görür | ✅ | staging-sales-chain.spec (iki tarayıcı); ziyaretçi (misafir) yolu elle |
| 🤖 Satış anasayfası "Talep \| Firma" pili, firma dizini | ✅ | staging-sales-chain.spec: pil aynı sayfada firma listesi açar, satınalma dizinine gitmez; panel-market.spec satınalma 5/5 |

## Parça 5 — Kısıtlı roller ve paketler

| Rol / paket | Görmemeli | Durum |
|---|---|---|
| 🤖 Onaylayıcı: pano/talep/sipariş 403, yalnız Onaylar + Ayarlar | ✅ | staging-roles.spec |
| 🤖 Görüntüleyici: işlem düğmeleri yok, listeler salt-okunur | ✅ | staging-roles.spec |
| 🤖 Satın Almacı: Ayarlar'da firma kartları yok | ✅ | staging-roles.spec |
| 🤖 Ücretsiz (STANDART): PUBLIC talep kilidi, davet gönderemez | ✅ | staging-roles.spec; 10 ürün tavanı API sözleşmesi |
| 🤖 Doğrulanmamış/STANDART: PUBLIC talep detayı 403 `TIER_REQUIRED`, listeye hiç girmez | ✅ | staging-role-bidding.spec |
| 🤖 **İzin matrisi**: 11 rol × 62 `company*` GET ucu — açık kapı ve yanlış kilit yok | ✅ | staging-role-matrix.spec → `docs/qa-role-matrix.md` (beklenti API kaynağından türetilir) |
| 🤖 **Ekran matrisi**: 8 rol × 23 panel sayfası — ok/yetki/portal/paket | ✅ | staging-role-screens.spec → `docs/qa-role-screens.md` — ❌ #6 Onaylar kapısı |
| 🤖 **Çok tedarikçili teklif**: iki AYRI firma tarayıcıdan teklif verir; kapalı zarf ekranda ve API'de; alıcı ikisini de görür | ✅ | staging-role-bidding.spec |
| 🤖 Görüntüleyici teklif veremez (düğme yok + POST 403); onaylayıcı talebi göremez | ✅ | staging-role-bidding.spec |
| 🤖 Yönetici kendi yetkisini düzenleyemez | ✅ | staging-roles.spec |

## Parça 6 — Admin paneli

| Akış | Durum |
|---|---|
| 🤖 Giriş (staging'de 2FA kapalı — canlı hesapta 2FA elle açılacak) | ✅ staging-admin.spec |
| 🤖 Firmalar: Başvurular kuyruğu → Belgeler "Hepsini Onayla" + "Kararı Kaydet" → "Firma doğrulandı"; red gerekçeli → Reddedildi | ✅ staging-admin.spec — ❌ #5 gerekçesiz red API'de kabul ediliyordu |
| 🤖 Ürün moderasyonu (Süper karar; Destek kuyruğu görür) | ✅ staging-sales-chain + staging-admin.spec; Satış (SALES) salt-okunur elle |
| 🤖 Kategori kürasyonu sayfası açılır | ✅ staging-admin.spec (sonuçsuz arama verisi elle) |
| 🤖 Destek rolü firma detayına giremez (API 403 + tarayıcıda "yetkiniz yok"), personel listesi 403 | ✅ staging-admin.spec (`uguray156+qa-admin-destek@gmail.com`, geçici parola her koşumda sıfırlanır) |

## Parça 7 — Bildirimler ve e-posta

Her akışta hangi e-posta kime gitti; Gmail'de `+qa-` etiketleriyle süzülür.
Transactional kapatılamaz; tercihlerden kapatılanlar gitmez.

| Akış | Durum | Not |
|---|---|---|
| 🤖 Satın alma zinciri (teklif, kazandırma, sipariş adımları, ödeme) | ✅ | EmailLog 2026-09-11: 32 `notification` SENT (18 alıcı kurucu, 14 tedarikçi kurucu), 0 FAILED |
| 🤖 Satış zinciri (ürün onayı, bilgi talebi, yanıt) + doğrulama kararı | ✅ | EmailLog 4 saat: 61 SENT, 0 FAILED (tedarikçi kurucu 21, alıcı kurucu 20, satışçı/görüntüleyici 2'şer) |
| Gmail'de içerik/CTA kontrolü (bağlantılar staging'e gidiyor mu) | | elle |
| Tercihten kapatılan bildirim gitmiyor | | elle |

## Parça 8 — Mobil

Parça 1 ve 3'ün ana ekranları 400 px genişlikte: menü, süzgeç çekmecesi, tablo taşması yok.

| Akış | Durum | Not |
|---|---|---|
| 🤖 Ziyaretçi: anasayfa (menü düğmesi), /urunler süzgeç çekmecesi, /firmalar, /alim-talepleri, talep detayı — yatay taşma yok | ✅ | staging-mobile.spec (400 px) |
| 🤖 Üye: panel anasayfa, Taleplerim, Siparişler, Bağlantılar, Ayarlar — menü açılır, yatay taşma yok | ✅ | staging-mobile.spec |
| Teklif formu ve sipariş sayfası 400 px | | elle |
