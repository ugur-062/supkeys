# Yayın Öncesi Tam Kontrol — 2026-09-22

> Kullanıcı: "yayına çıkmamıza çok az kaldı, her şeyi baştan aşağı kontrol
> etmeliyiz." Bu belge o turun kaydıdır: ne koşuldu, ne bulundu, ne
> düzeltildi, ne operatörde/kararda kaldı. Önceki tur: `qa-review-2026-09-19.md`.

## 0. Sonuç tek cümleyle

**Kod tarafı yayına hazır.** Otomatik paketler yeşil, staging'de tam iş
akışı (kayıt → talep → teklif → kazandırma → sipariş → teslim) tarayıcıdan
geçti, canlı altyapı denetimleri temiz. Yayın öncesi **operatör tarafında iki
engel** var (Render canlı API ücretsiz planda; Supabase PITR/yedek tatbikatı
yok) ve **beş yüksek** madde (aşağıda §5). Kod tarafında bu turda bulunan 12
kusur düzeltilip canlıya alındı (§4).

## 1. Otomatik testler

| Paket | Sonuç |
|---|---|
| Web birim (vitest) | 139 dosya / 784 test yeşil — UTC ve Europe/Istanbul saat dilimlerinde ayrı ayrı |
| Admin birim | 17 / 84 yeşil |
| API (birim + entegrasyon) | CI'da yeşil (yerelde Docker test DB yok; `Test (api + typecheck)` ×3 pass) |
| Staging e2e (89 test, tam paket, paralel) | 82 geçti · 7 kaldı: **4 axe renk kontrastı (K-2, karar bekliyor)** + 3 paralel yük flake'i (`company-tenders` ×2, `panel-market` ×1) — seri koşumda 7/7 geçti |
| `pnpm audit --prod --audit-level high` | 0 kritik / 0 yüksek (3 düşük, 6 orta — bilinçli ertelenen ana sürüm göçleri) |
| Lint | hatasız (4 dosyada önceden var olan `no-unused-vars` uyarıları) |

## 2. Canlı altyapı denetimi (www / admin / api.rothern.com)

| Kontrol | Sonuç |
|---|---|
| Güvenlik başlıkları | HSTS 1 yıl + includeSubDomains, `X-Frame-Options DENY` (api: SAMEORIGIN), nosniff, referrer-policy, permissions-policy; admin CSP nonce + strict-dynamic; herkese açık sayfalar `unsafe-inline` (tasarım: ISR, nonce'suz); API CSP `default-src 'none'` |
| robots / sitemap / llms | `robots.txt` izin listesi + panel yasağı; `sitemap.xml` 6 parçalı indeks, tek konak; `llms.txt`/`llms-full.txt` 200 |
| CORS | yabancı origin ön-uçuşu 404, `www.rothern.com` 204 + credentials |
| API | `/health` ok, DB up, kur verisi taze; bilinmeyen rota 404 JSON; herkese açık uçlar 200 (canlıda veri yok) |
| Alan adı | apex `rothern.com` → 308 `www`; `http://` → 308 `https://` |
| Künye + e-posta DNS (`prod-health.mjs`) | unvan/MERSİS/vergi no/e-postalar tek kaynakla aynı; DKIM, SPF, DMARC (`p=none`, rapor adresi var) |
| Vercel env (web) | `NEXT_PUBLIC_API_URL/SITE_URL/CDN_URL/MARKETPLACE_LIVE`, `SENTRY_*`, `SEO_REVALIDATE_SECRET`, `INDEXNOW_KEY` production'da tanımlı; `NEXT_PUBLIC_{GOOGLE,BING}_SITE_VERIFICATION` yok (bilinçli: "site bitince en son") |
| Vercel env (admin) | `NEXT_PUBLIC_API_URL` + `SENTRY_*` tanımlı |
| Oturum çerezi (staging ölçümü) | `rk_company` HttpOnly + Secure + SameSite=Lax + Domain, 7 gün; `rk_csrf` Secure + Lax |
| Giriş hız sınırı | 10/dk/IP çalışıyor (`x-ratelimit-remaining-auth` düşüyor). **Not:** sayaç bellek içi ve örnek başına — dağıtım sırasında iki örnek çalışırken sayaç bölünüyor (ölçüldü); tek örnekte sorun değil, yatay ölçek gelirse Redis deposu gerekir |
| Genel hız sınırı | 100/dk/IP **rota başına** (panel sayfası 7–20 istek atıyor, sayaç rota başına olduğu için ofis NAT'ı arkasındaki ekipler için sorun değil — ölçüldü) |
| Vercel Attack Challenge | proje düzeyinde KAPALI; curl ile dakikalarca yoklama tek istemciye "Security Checkpoint" gösterdi (gerçek ziyaretçi etkilenmez) |
| Render / Supabase / Resend / Cloudflare | yerelde API anahtarı yok → **panelden doğrulanacak** (§5) |

## 3. Staging tarayıcı turu (demo hesaplar)

- **50 panel sayfası + 11 herkese açık sayfa:** hepsi 200, h1 var, 5xx yok, JS hatası yok (tek istisna: `satinalma` anasayfasında dağıtım anına denk gelen bir XHR hatası; endpoint sonradan 200 + CORS başlıklı ölçüldü).
- **Alıcı turu:** hızlı talep kartının her düğmesi (katalog, Excel, belgeden doldur, AI başlık/kategori, adres ekle, süre çipleri, AI keşif modalı + web araması 10 sonuç, davet seçici, şablon kaydı) → yayın ✓ → iki QA tedarikçi teklifi 201 → Gelen Teklifler'de Kazandır/Ele düğmeleri.
- **Satıcı turu:** açık talepler 20 satır, sıralama çipleri, talep detayı, teklif formu (2 kalem, belge alanı), onay diyaloğu, gönderim ✓, ikinci teklif kilitli ✓, Tekliflerim'de görünür.
- **Sipariş zinciri (UI):** kazandırma → satıcı Kabul (ödeme hesabı seçimi) → Siparişi Tamamla (fatura no) → alıcı Teslim Aldım → COMPLETED; ödeme bildir/onayla/değerlendir düğmeleri yerinde.
- **Hidrasyon:** 4 yüklemede sıfır hata (gece 00:00–03:00 penceresinde yakalanan #418 bu turda düzeltildi, §4).
- Herkese açık yüzey (32 rota, 17 header/footer bağlantısı, 6 sitemap parçası, llms, eski rota yönlendirmeleri): ayrı ajan taraması; bulgular §4/§6'da.

## 4. Bu turda düzeltilenler (canlıda)

| # | Bulgu | Düzeltme |
|---|---|---|
| 1 | Takvim günü/tarih metni yerel saat dilimiyle → sunucu UTC / tarayıcı +3, her gece 00:00–03:00 "N gün kaldı" hidrasyon #418 | `lib/time-zone.ts` tek kaynak (Europe/Istanbul); `daysUntil`, `formatDate`, `formatTime` |
| 2 | `RLS_ENABLED=true` iken `DATABASE_URL_BYPASS` boşsa bypass istemcisi sessizce kısıtlı role düşüyordu | boot kapısı `checkRlsBypassConfig` (+ birim testi) |
| 3 | Gizlilik §3 ve Aracılık §2: herkese açık talepte "firmanızın adı ve konumu görünür" — ürün alıcı adını GİZLİYOR | metin "şehir, ülke, sektör, faaliyet tipi; ad yalnız üyelere"; güncelleme tarihi 22 Eylül 2026 |
| 4 | Giriş / Kaydol / Şifre sıfırla başlığı "… — Rothern · Rothern" | sayfa başlıklarından ek kaldırıldı |
| 5 | `/reset-password` (jetonlu) index'e açık; "Token bulunamadı" | `noindex`; "Bağlantı geçersiz" |
| 6 | `/davet-kapat` başlıksız, index'e açık | düzen ile başlık + `noindex` (+ force-dynamic) |
| 7 | 404 sayfasında h1 yok | h1 "Sayfa bulunamadı" |
| 8 | Nasıl çalışır örnek zaman çizelgesi 2024 | 2026 |
| 9 | `/urunler/kategori/<kod>` (eksik slug) 308 yerine 200 + boş gövde (`loading.tsx` akışı) | segmentten `loading.tsx` kaldırıldı → 308 |
| 10 | Firma profili h1 "Ad Doğrulanmış Gold Üye" | rozetler h1'in kardeşi |
| 11 | `/tedarikciler` → `/firmalar/` → `/firmalar` çift 308 | kök ve alt yol ayrı kural |
| 12 | `render.yaml` `JWT_EXPIRES_IN: 1h` (ölçülen oturum 7d; Blueprint senkronu saatte bir çıkışa düşürürdü) | 7d |
| — | CLAUDE.md "RLS canlıda hâlâ kapalı" çelişkisi | düzeltildi |

Önceki gün canlıya alınan (aynı tur sayılır): anasayfa varsayılan Tedarikçiyim, firma arama kalktı, kategori vitrini çizgisel ikon, öne çıkanlar şeridi kalktı, görünürlük ülkesi (PR #49–#52).

## 5. Operatörde — yayından ÖNCE (risk sırasıyla)

| # | Madde | Aksiyon |
|---|---|---|
| **B1** | **Render canlı API ücretsiz planda** (`render.yaml` `plan: starter` yazsa da panel Free ölçülmüştü; kart 1 Ekim'e dek eklenemiyor) — servis 15 dk boşta uyur, ilk istek 30–60 sn | Render → rothern-api → Instance Type **Starter**. Kart eklenene kadar geçici: UptimeRobot `https://api.rothern.com/api/health` 5 dk ping |
| **B2** | **Supabase PITR yok, restore tatbikatı yapılmadı** — ilk gerçek veriden önce şart | rothern-prod → Compute **Small** (PITR ön koşulu) → Add-ons **PITR** → retention ≥ 30 gün → `docs/backup-restore-drill.md` tatbikatını YENİ projeye koş, tabloya kaydet |
| Y1 | Tohum admin `admin@rothern.com` aktif ve 2FA kapalı; kendi admin hesabında 2FA kapalı | admin.rothern.com → Personel → tohum hesabı pasifleştir; kendi hesabında 2FA aç |
| Y2 | Resend canlı plan/kotası bilinmiyor — kota dolarsa kayıt/doğrulama/davet e-postası durur | Resend → Billing/Usage; ücretli plana geç |
| Y3 | RLS canlıda açıldıktan (17 Eylül) sonra canlı uçtan uca akış koşulmadı (son canlı tur 13 Eylül) | `! bash apps/web/scripts/e2e-prod.sh e2e/prod-journey.spec.ts e2e/prod-admin.spec.ts` (gerçek e-posta gönderir, kendi verisini siler) |
| Y4 | Künyede telefon yok — Mesafeli Sözleşmeler Yönetmeliği satıcı telefonunu zorunlu tutar | numara gelince `lib/company-info.ts` `OPERATOR.phone` → künye + mesafeli §1 + JSON-LD (ben yaparım) |
| Y5 | `RUN_SEED` canlıda `false` olmalı — `true` kalırsa her yeniden başlatmada admin şifresi `INITIAL_ADMIN_PASSWORD`a döner | Render env'de `RUN_SEED=false`, `INITIAL_ADMIN_PASSWORD` silinmiş olduğunu gözle |
| O1 | `CORS_ALLOW_VERCEL` canlıda boş/false olmalı (kod varsayılanı false) | Render env'de gözle |
| O2 | Canlı Gemini anahtarı (`GEMINI_API_KEY` ya da service account) — yoksa asistan / belgeden talep / AI arama 503 | Render env'de gözle; bir kez asistanı canlıda dene |
| O3 | Supabase Auth: "Allow new users to sign up" KAPAT (kayıt service-role ile), Auth rate limit'leri sıkılaştır, **Enforce SSL** (birkaç dk kesinti — trafik yokken) | rothern-prod → Authentication / Database → Settings |
| O4 | Sentry KVKK: Data Scrubber + "Prevent storing IP" (3 proje) | Sentry → Org Settings → Security & Privacy |
| O5 | SEO yayın anı ("site bitince EN SON"): Render'da `INDEXNOW_KEY` + `SEO_REVALIDATE_SECRET` (Vercel'dekiyle AYNI) + `WEB_URL=https://www.rothern.com`; Search Console + Bing sitemap; `NEXT_PUBLIC_{GOOGLE,BING}_SITE_VERIFICATION` → redeploy → `pnpm --filter @rothern/web seo:audit` | Render + Vercel + arama konsolları |
| O6 | R2 yedek: versioning özelliği yok, ikinci kovaya kopya betiği yok — silinen belge geri gelmez | kod işi (isteğe bağlı): sunucu taraflı günlük kopya betiği |

## 6. Karar bekleyen (kullanıcı)

| # | Konu | Seçenekler |
|---|---|---|
| K-2 | **Renk kontrastı** — mavi `#2F9BF2` beyaz üstünde 2,96:1, yeşil `#1FB864` 2,59:1 (WCAG AA 4,5). Gecelik e2e her gece bundan kırmızı (#39) | (a) `globals.css` `blue-600 → #0D77CC` (4,64:1) ve `emerald-600 → #168146` (4,93:1); tonlar biraz koyulaşır, düğme rengi mantığı aynı · (b) kapıyı gevşet (`serious` kontrastı uyarıya çevir) · (c) olduğu gibi bırak, gecelik kırmızıyı kabullen |
| K-3 | **Paket fiyatı** 160 / 230 USD "yıllık ödemede" pazarlama sayfasında basılı; mesafeli satış §4 ile tutarlılık | onay ya da yeni değer → `lib/pricing/plans.ts` |
| K-4 | Footer "Sözleşmeler" sütununda **Mesafeli Satış** ve **İptal ve İade** yok (yalnız sitemap'ten ulaşılıyor); paket satın alma özet kartında da bağlantı yok | eklemem için onay (ön bilgilendirme yükümlülüğü) |
| K-5 | Herkese açık **/firmalar dizini + üst çubuk "Firmalar" sekmesi** — anasayfadan firma arama kalktı, dizin duruyor (profil sayfaları SEO stratejisinin temeli) | kalsın / kapansın |
| K-6 | Aracılık sözleşmesinde "ilan" ile "satın alma talebi" karışık (9 yerde "ilan") | terminolojiyi "talep"e çekmem için onay (hukuki metin) |
| K-7 | Demo pazar yeri tohumunda "hastane ihalelerine uygun raporlar" (`seed-marketplace-demo.ts`; canlıya taşınmıyorsa etkisiz) | "alımlarına" yapayım mı |

## 7. Düşük öncelik / yayın sonrası

- Doğrulama kodu tuzsuz sha256 (`company-auth.service.ts`) → HMAC; U-4 admin "Düzeltmeye gönder" düğmesi 10 karakterin altında aktif; hız sınırı deposu Redis (yatay ölçek gelirse); R2 CORS'ta `*.vercel.app` kalıcı (presigned URL asıl sınır); `public-inquiry` ve `realtime.gateway` kendi `WEB_URL`/CORS kopyasını taşıyor (boot kapısı koruyor); log drain; `.env.production.example` "Coolify/Hetzner" başlığı; staging webhook sırrı.
- **Belge bayatlığı:** `docs/pending-operator-tasks.md` 5 Eylül'den beri dokunulmamış (Resend domain, pazar yeri, demo firma, "RLS kapalı" satırları kapandı); `docs/launch-checklist.md` kutularının çoğu bayat (RLS, admin, Vercel Pro, Sentry tamam). Bu belge güncel kaynaktır; yayından sonra ikisi arşivlenmeli.

## 8. Yöntem

Paralel: tam staging e2e (23 dk) · web/admin birim · üç okuma ajanı (kod hijyeni: debug kalıntısı, ortam sızıntısı, fail-open varsayılan, tohum/yıkıcı betik, sır; yayın belgeleri ↔ gerçek durum uzlaştırması; herkese açık 32 rota + yasal sayfalar) · canlı başlık/robots/CORS/env/DNS denetimi · staging tarayıcı turu (`walk-pages`, `walk-buyer`, `walk-seller`, `walk-approval`) · hız sınırı ve çerez ölçümleri.
