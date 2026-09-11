# Yayın öncesi QA matrisi (2026-09-11)

Ortam: **staging** (`staging.rothern.com`, `admin.staging.rothern.com`). Hesaplar:
`uguray156+qa-<slug>@gmail.com` / `Staging1234!` (`seed-staging-roles`). Admin:
`uguray156@gmail.com` (Render `INITIAL_ADMIN_PASSWORD`).

Hücre değerleri: `✅` geçti · `❌ #n` bulgu (docs/qa-punchlist.md) · `—` rol için geçerli değil · boş = henüz bakılmadı.
Otomatik (Playwright/curl) koşan satırlar `🤖` ile işaretli; kalanı elle.
Staging e2e: `pnpm --filter @rothern/web e2e:staging` (14 test, 2026-09-11 tümü yeşil; demo veri `seed-marketplace-demo` ile).

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
| Kayıt formu: doğrulama kodu e-postası gelir (Gmail) | | |
| Şifremi unuttum akışı | | |

## Parça 2 — Kurucu (alıcı firma, Gold, doğrulanmış)

| Akış | Durum | Not |
|---|---|---|
| 🤖 Giriş → panel; portal anahtarı Satınalma/Satış | ✅ | company-tenders.spec staging (QA kurucu) |
| Ayarlar › Firma Bilgileri: kimlik salt-okunur, ad/unvan kilitli | | |
| Ayarlar › Kullanıcı Yönetimi: davet, yetki tablosu, koltuk sayacı | | |
| Ayarlar › Adres, Banka, 2FA, Bildirimler | | |
| Şirketim › Profil: logo/kapak yükleme, kaydet, herkese açık görünüm | | R2 |
| Doğrulama Belgeleri: belge yükleme (admin tarafında görünür) | | |

## Parça 3 — Satın alma zinciri (alıcı ↔ tedarikçi)

| Akış | Durum | Not |
|---|---|---|
| Hızlı talep: kalemler, adres, süre, kime (PUBLIC) → yayınla | | |
| Detaylı sihirbaz 4 adım; taslak; kopya | | |
| Tedarikçi (satışçı) açık talebi görür, **Teklif Ver** ilk ekranda | | dünkü hata |
| Teklif formu: kalem fiyatı, teslim süresi, geçerlilik → gönder | | |
| Alıcı teklifleri görür; tedarikçiler birbirini GÖRMEZ | | kapalı zarf |
| Kazandırma → onay akışı (Onaylayıcı) → sipariş oluşur | | |
| Sipariş: satıcı onaylar → gönderir → alıcı teslim alır → ödeme bildir/onayla → tamamla | | |
| E-postalar: davet, teklif, kazandırma, sipariş adımları (Gmail) | | |

## Parça 4 — Satış zinciri

| Akış | Durum | Not |
|---|---|---|
| Ürünlerim: ürün ekle (5 bölüm), görsel, anahtar kelime → onaya gönder | | |
| Admin: /admin/urunler kuyruğu → onayla → vitrinde | | |
| Yayındaki ürünü düzenle → yeniden PENDING, vitrinde kalır | | |
| Bilgi talebi (ziyaretçi ve üye) → satıcı yanıtlar | | |
| Satış anasayfası "Talep \| Firma" pili, firma dizini | | panel-market.spec satınalma dizinini/sekmeleri/Bağlantılar'ı staging'de geçti (5/5); satış tarafı elle |

## Parça 5 — Kısıtlı roller ve paketler

| Rol / paket | Görmemeli | Durum |
|---|---|---|
| Onaylayıcı: pano/talep/sipariş 403, yalnız Onaylar + Ayarlar | | |
| Görüntüleyici: işlem düğmeleri yok, listeler salt-okunur | | |
| Satın Almacı: Ayarlar'da firma kartları yok | | |
| Ücretsiz (STANDART): PUBLIC talep kilidi, davet gönderemez, 10 ürün tavanı | | |
| Doğrulanmamış: PUBLIC talebe teklif kapısı; "Doğrulanmamış firma" etiketi | | |
| Yönetici kendi yetkisini düzenleyemez | | |

## Parça 6 — Admin paneli

| Akış | Durum |
|---|---|
| Giriş + 2FA | |
| Firmalar: doğrulama onay/red (belge bazlı) | |
| Ürün moderasyonu (Süper/Destek karar, Satış salt-okunur) | |
| Kategori kürasyonu (sonuçsuz aramalar) | |
| Destek rolü firma detayına giremez | |

## Parça 7 — Bildirimler ve e-posta

Her akışta hangi e-posta kime gitti; Gmail'de `+qa-` etiketleriyle süzülür.
Transactional kapatılamaz; tercihlerden kapatılanlar gitmez.

## Parça 8 — Mobil

Parça 1 ve 3'ün ana ekranları 400 px genişlikte: menü, süzgeç çekmecesi, tablo taşması yok.
