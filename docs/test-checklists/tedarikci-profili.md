# Tedarikçi Profili — Manuel Test Checklist

V2-PUBLIC-PROFILE + V2-REVIEWS + V2-SEO uçtan uca test.

---

## 0. Ön kontrol

```bash
# Migration uygulanmış mı
pnpm --filter @rothern/db exec prisma migrate status
# Beklenen: "Database schema is up to date"

# API çalışıyor mu
curl -sf -o /dev/null -w "API %{http_code}\n" http://localhost:4000/api/health

# .env'de R2 + SITE_URL doldurulmuş mu
grep -E 'R2_PUBLIC_BASE_URL|NEXT_PUBLIC_SITE_URL' .env
```

**Kritik:** R2 bucket'ta **Allow Access** aktif olmalı. Cloudflare R2 panelden:
- Bucket → Settings → Public Access → R2.dev subdomain → **"Allow Access" butonuna tıkla**

URL'i kopyalamak yeterli DEĞİL, butonu tıklamak şart. Aksi: yüklenen görseller browser'da yüklenmez (TLS handshake fail).

Test:
```bash
# Bucket public mi (cover/photo upload sonrası key ile)
curl -sI "$R2_PUBLIC_BASE_URL/dev/supplier-profile/<supplierId>/cover-<id>-file.jpg" | head -1
# Beklenen: HTTP/2 200
```

---

## 1. PREMIUM gating

| # | Adım | Beklenen |
|---|---|---|
| 1.1 | STANDARD tedarikçi (membership ≠ PREMIUM) ile giriş → `/supplier/profil` | Üstte sarı amber "Herkese Açık Profil — PREMIUM" upsell kartı. "PREMIUM'a Yükselt" butonu `/supplier/ayarlar`'a yönlendirir |
| 1.2 | STANDARD tedarikçi `/supplier/profil/public` URL'ini direkt yaz | "PREMIUM gerekli" gating görünür |
| 1.3 | DB'de membership = PREMIUM, slug = null, publicEnabled = true ata, tedarikçi yenile | Profil sayfası `PublicProfileCard` "Profili Oluştur" CTA gösterir |
| 1.4 | DB'de slug atadıktan sonra | Aynı kart artık "Yayında" rozeti + `/t/{slug}` + "Aç" / "Düzenle" |

---

## 2. Editor — Temel alanlar

| # | Adım | Beklenen |
|---|---|---|
| 2.1 | `/supplier/profil/public` aç | Hero kartı: avatar + companyName + StatusBadge + (slug varsa) "Profili Aç" |
| 2.2 | Slug input'una "ABC FİRMA" yaz | Otomatik `abc-fi̇rma`'ya normalize edilir (lowercase + tire) — Türkçe karakter kalmayabilir |
| 2.3 | Slug = "demo-tedarik" (çakışan başka supplier'da var) | "Kaydet" → toast: "Bu slug başka bir tedarikçi tarafından kullanılıyor" |
| 2.4 | Slug'ı boşalt, kaydet | Status "Slug bekliyor" amber rozet; `/t/{slug}` 404 |
| 2.5 | publicEnabled toggle kapat, kaydet | Status "Yayın Dışı" slate rozet; `/t/{slug}` 404 |
| 2.6 | "Hakkımızda" boş bırak + Kaydet | Hata yok (boş = silindi) |
| 2.7 | "Hakkımızda" 2001 karakter yaz | textarea zaten 2000'de keser, kaydet sorun yok |
| 2.8 | Hizmet etiketi ekle: Enter ile + buton ile, 20 etiket | 20'de "Ekle" disable, input disable |
| 2.9 | Aynı etiketi 2 kez ekle | Reddet (mevcut listede varsa, sessizce) |

---

## 3. Editor — URL alanları (BUG FIX REGRESYON)

Bu sorun "Kaydet doğrulama hatası alıyorum" şikâyetinden geldi.

| # | Adım | Beklenen |
|---|---|---|
| 3.1 | Tüm URL alanları boş + Kaydet | ✅ Başarılı, hata yok (önceden @IsUrl reddediyordu) |
| 3.2 | Website = "example.com" (protokolsüz) + Kaydet | ❌ Hata: "website must be a URL address" — protokol şart |
| 3.3 | Website = "https://example.com" + Kaydet | ✅ Başarılı |
| 3.4 | Website = "   " (sadece boşluk) + Kaydet | ✅ Başarılı (trim → "" → undefined) |
| 3.5 | Website dolu → boşalt → Kaydet | ✅ Başarılı, DB'de null'a döner, public profilde gizli |
| 3.6 | linkedinUrl = "https://linkedin.com/company/xyz" + Kaydet | ✅ Başarılı |

---

## 4. Cover image (R2 upload)

| # | Adım | Beklenen |
|---|---|---|
| 4.1 | Editör → "Kapak Yükle" → 6MB JPG | toast "Dosya 5MB'dan büyük olamaz" |
| 4.2 | "Kapak Yükle" → SVG dosya | toast "Sadece JPEG / PNG / WebP" |
| 4.3 | "Kapak Yükle" → 2MB PNG | Upload progress → preview görünür → toast "Kapak güncellendi" |
| 4.4 | "Değiştir" → yeni cover yükle | Eski R2'dan silinir, yeni gösterilir |
| 4.5 | "Kaldır" → onay → onayla | toast "Kapak kaldırıldı", preview gradient'a döner |
| 4.6 | R2 Allow Access AÇIK DEĞİLSE | Cover yüklenir ama browser'da yüklenmez → onError fallback: "Kapak yüklenemedi — R2 bucket public erişim aktif değil" (sarı amber kart) |

---

## 5. Galeri (R2 multi-upload)

| # | Adım | Beklenen |
|---|---|---|
| 5.1 | "Fotoğraf Ekle" → 3 JPG seç | Sırayla yüklenir, her biri için toast; "3 fotoğraf eklendi" |
| 5.2 | 12 fotoğraf yükle | Sayaç "12/12", buton disable |
| 5.3 | 13'üncüyü dene | toast "Galeri en fazla 12 fotoğraf içerebilir" |
| 5.4 | Foto hover → X butonu görünür | Tıkla → onay → silinir, DB + R2'dan |
| 5.5 | Galeri grid'inde foto yüklenmiyor (R2 erişim yok) | onError fallback: "Görsel yüklenemedi" yer tutucu |

---

## 6. Public profil görüntüleme

| # | Adım | Beklenen |
|---|---|---|
| 6.1 | `/t/var-olan-slug` aç | Hero cover → profil kartı (avatar, name, badges, rating widget, Web butonu) → stats şeridi (Değerlendirme/Hizmet/Kategori) |
| 6.2 | Cover yoksa | Brand gradient + subtle dot pattern overlay |
| 6.3 | Hiç review yok | "Değerlendirmeler" bölümü tamamen gizli, hero'da rating widget de yok |
| 6.4 | 1+ review var | Hero'da büyük "★ X.X / N değerlendirme" widget; bölümde dağılım barı + yorum listesi |
| 6.5 | aboutText null | "Hakkımızda" bölümü gizli |
| 6.6 | services boş | "Hizmetler" bölümü gizli |
| 6.7 | photos boş | "Galeri" bölümü gizli |
| 6.8 | Var olmayan slug | Next.js notFound() → 404 sayfası |
| 6.9 | STANDARD supplier'ın slug'ı | Aynı 404 (görünmez, yetki sızdırılmaz) |
| 6.10 | publicEnabled=false | Aynı 404 |

---

## 7. Rating / Yorum (V2-REVIEWS)

| # | Adım | Beklenen |
|---|---|---|
| 7.1 | Alıcı: sipariş `status != COMPLETED` aç | Sipariş detayında "Tedarikçiyi Değerlendir" kartı YOK |
| 7.2 | Sipariş COMPLETED, alıcı kendi tenant'ın siparişi | Kart var, "Değerlendir" CTA |
| 7.3 | 5 yıldız + yorum yaz + Kaydet | toast "Değerlendirme kaydedildi", kart yorum görüntüsüne döner |
| 7.4 | "Düzenle" → puan değiştir + Kaydet | Aynı kayıt güncellenir (orderId unique) |
| 7.5 | 30 günden eski review için "Düzenle" yok | "30 günlük düzenleme süresi geçti" mesajı |
| 7.6 | "Sil" → onay | Kayıt silinir, "Değerlendir" CTA geri gelir |
| 7.7 | "Yorumum public olsun" UNCHECK + Kaydet | Public profilde rating count'a sayılır ama yorum metni listede gizli |
| 7.8 | Public profilde yorum gör | Reviewer avatar (initials), firma adı, tarih, yıldız, metin |

---

## 8. SEO — sitemap + robots + JSON-LD

```bash
# robots
curl -s http://localhost:3000/robots.txt
# Beklenen: Allow: /t/, Disallow: /dashboard/, sitemap referansı

# sitemap
curl -s http://localhost:3000/sitemap.xml | grep -c '<loc>'
# Beklenen: 2 + (görünür supplier sayısı)

# Görünür supplier sayısı
curl -s http://localhost:4000/api/public/suppliers | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"

# JSON-LD inject
curl -s http://localhost:3000/t/demo-tedarik | grep -o 'application/ld+json'
# Beklenen: 1 satır

# JSON-LD içerik kontrolü
curl -s http://localhost:3000/t/demo-tedarik | python3 -c "
import sys, re, json
html = sys.stdin.read()
m = re.search(r'application/ld\+json\"[^>]*>(.+?)</script>', html, re.S)
if not m: print('JSON-LD bulunamadı'); exit(1)
data = json.loads(m.group(1))
print('@type:', data.get('@type'))
print('name:', data.get('name'))
print('aggregateRating:', data.get('aggregateRating'))
print('review count:', len(data.get('review', [])))
"
```

Beklenen JSON-LD alanları:
- `@type: Organization`
- `name`, `url`, `address`
- `aggregateRating` (sadece review > 0 ise)
- `review` array (varsa)
- `sameAs` (sosyal medya, varsa)

[Google Rich Results Test](https://search.google.com/test/rich-results) → URL'i gir (lokal için JSON-LD'yi kopyala, Code sekmesine yapıştır) → "Organization" + "Review" detected görmeli.

---

## 9. Bilinen sorunlar / sınırlamalar

- **R2 public erişim**: bucket'ta "Allow Access" aktif değilse cover/galeri görselleri 404. `onError` fallback "Görsel yüklenemedi" gösterir.
- **R2_PUBLIC_BASE_URL yok**: presigned GET fallback'i kullanılır (1 saat TTL, public profil için ideal değil).
- **NEXT_PUBLIC_SITE_URL = localhost:3000**: production'da gerçek domaine değiştirilmeli, aksi sitemap/canonical bozulur.
- **Slug'da Türkçe karakter normalize edilir**: kullanıcı `şirket` yazarsa `irket`'e dönüşür (sondaki `ş` kaybolur). Frontend `toLowerCase().replace(/\s+/g, "-")` yapıyor, Türkçe karakter elenmiyor → DTO regex `[a-z0-9-]*` reddeder. (Faz 4 polish: slug-generator helper'ı frontend'de kullan.)
- **Test runner kırık**: V2-7 refactor sırasında bcrypt mock'ları Supabase Auth geçişiyle uyumsuz. `update-public-profile.dto.spec.ts` Jest install edildiğinde çalışır.
