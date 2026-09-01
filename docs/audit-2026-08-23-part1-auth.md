# Denetim 2026-08-23 — Parça 1: Kimlik & Oturum

> **Terminoloji notu (2026-09-01):** Bu rapor yazıldığında ürün dilinde
> "ihale" kullanılıyordu. Sonradan kullanıcı-yüzü dil **"satın alma talebi"**
> (satış tarafında "ilan") olarak değiştirildi. Rapor metni BİLİNÇLİ olarak
> güncellenmedi: o tarihteki kodu ve dizeleri anlatıyor, bugünkü sözcükle
> yeniden yazılırsa okuyucu git geçmişinde başka bir şey bulur. Kod adları
> (`IhaleListView`, `ihaleler-view.tsx` vb.) zaten değişmedi. Bkz. CLAUDE.md
> § Ürün Dili.



Yöntem: 6 mercek paralel bulgu toplama (76 ham) → tekilleştirme → HIGH/MED adaylar
için bağımsız çürütme turu (14 ajan; doğruluk + etki + tasarım/kabul mercekleri
birlikte) → LOW'lar elle kod doğrulaması. Kod DEĞİŞTİRİLMEDİ; bu doküman rapor.
Önceki denetimlerde kapatılmış / bilinçli kabul edilmiş maddeler yeniden açılmadı
(CSRF SameSite=none bypass → boot-guard; REST *.vercel.app → CORS_ALLOW_VERCEL;
WS DB-taze iptal; JWT_SECRET boot-guard; F-WS-2 residual; Y6 reaper; per-e-posta
cooldown).

## DOĞRULANAN (çürütme turunu geçti)

| # | Şiddet | Bulgu | Kanıt | Düzeltme taslağı |
|---|---|---|---|---|
| 1 | **HIGH** | WS handshake'te bozuk Cookie (`%E0%A4%A`, `%zz` — HERHANGİ bir çerez) `parseCookies` → `decodeURIComponent` URIError; çağrı `try` DIŞINDA → unhandledRejection → **SENTRY_DSN yoksa Node süreci düşer** (kimliksiz tek istekle DoS); DSN varsa soket kimliksiz/timer'sız açık kalır | realtime.gateway.ts:82-89, cookie.ts:154; repro: dist gateway + socket.io, exit=1 | `parseCookies` toleranslı decode (try/catch per değer — REST 500'lerini de kapatır); token çıkarımını `try` içine al; e2e test; `process.on('unhandledRejection')` log ağı |
| 2 | MED | **Logout çalışmıyor** (token yarı-ömrünü geçmişse): `clearAuthCookies` sonra global interceptor `maybeSlide` aynı yanıta taze `rk_company` + CSRF yazıyor → tarayıcıda son Set-Cookie kazanır; admin'de polling yok → deterministik | auth-cookie.interceptor.ts:99-119, company-auth.controller.ts:48-53 (`@Res passthrough`); repro ile teyit | `clearAuthCookies` yanıtı işaretlesin (`res.locals.rkAuthCleared`), `maybeSlide` atlasın; sliding-session.spec'e logout senaryosu |
| 3 | MED | **Admin realm'de oturum iptali yok**: PlatformAdmin'de tokenVersion yok, parola değişimi/reset/2FA değişimi eski JWT'leri düşürmez, kayan oturum süresiz yaşatır (company tarafında parite var) | admin-jwt.strategy.ts:34-43, admin-auth.service.ts:126 | `PlatformAdmin.tokenVersion` (additive migration) + payload `tv` + strategy kontrolü; changePassword/reset/2FA değişiminde `tv++` (company deseni) |
| 4 | MED | **Admin TOTP sırrı DB'de düz metin** (firma tarafı AES-256-GCM, testli); sır istemciden geliyor; kurtarma kodu yok | admin-auth.service.ts:161-171; firma: company-auth.service.ts:836 | firma şifreleme yardımcısını `common/auth/totp-secret-cipher.ts`'e çıkar, admin'de kullan (lazy migration: `enc:v1:` prefix) |
| 5 | MED | **Sentry'e cookie/header/gövde gidiyor**: `requestDataIntegration` varsayılanı cookies/headers/data=true; `sendDefaultPii:false` bunu kapatmıyor → beklenmedik 500'lerde rk_company JWT + parola/2FA gövdesi Sentry'de | instrument.ts:24 (@sentry/nestjs 8.55) | `requestDataIntegration({ include: { cookies:false, data:false, headers:false, ip:false } })` + `beforeSend` temizliği |
| 6 | MED | **Davet token'ı access log'da**: `GET /company/invitations/:token` URL path'te → pino `req.url` redakte değil (EmailLog'da redakte edilen token logda açık); referral opt-out `?token=` aynı; DB'de düz metin (reset token hash'li — tutarsız) | company-invitations.controller.ts:14, company-users.service.ts:168, app.module.ts redact listesi | pino `serializers.req` ile path/query token maskele (+ `req.params/query.token` redact); tercihen POST gövdeyle taşı + hash'li sakla |
| 7 | MED | **trust proxy=1 yanlış**: api.rothern.com Cloudflare (Render'ın kendi CF ön ucu: `server: cloudflare`, `cf-ray`) → XFF 3 hop (istemci, CF, Render LB) → `req.ip` = CF egress → throttle + audit IP yanlış (ortak 429 / zayıf per-IP) | main.ts:43; canlı header kontrolü 2026-08-23 | `trust proxy` = adres listesi (`loopback`,`uniquelocal`, Cloudflare aralıkları) ya da `resolveClientIp` (cf-connecting-ip) + throttler tracker; prod'da XFF'i bir kez logla ve doğrula |
| 8 | MED | **Kuruculuk devri**: hedefin `permissionsOverride` temizlenmiyor → yeni Kurucu `removed` anahtarlarıyla kilitlenir (kendi kendine düzeltemez); devir PASİF üyeye yapılabiliyor → firma aktif yöneticisiz kalabilir | company-users.service.ts:926, :1195 | devirde hedef `permissionsOverride = DbNull`; hedef `isActive` şartı |
| 9 | MED | **6 haneli kod brute-force**: kod-başına 5 deneme var ama `resend`/login-2FA her çağrıda sayaç sıfır yeni kod; hesap-bazlı üretim tavanı yok; yalnız IP throttle (in-memory, CF IP'sine keyli → #7 ile birleşince per-IP sınır fiilen yok); attempts artışı atomik değil | company-auth.service.ts:224-324 | hesap-bazlı kod üretim tavanı (ör. 5/saat) + attempts koşullu `updateMany` |
| 10 | MED | **Supabase Auth hata sınıfı**: 429/5xx/ağ → kullanıcıya "E-posta veya parola hatalı", audit'e `bad_credentials`, log debug, Sentry yok → kesintide görünmezlik + yanlış audit | supabase-auth.service.ts:67 | status 400/401/403 → 401; 0/429/≥500 → `ServiceUnavailable` + `reportToSentry` |
| 11 | LOW | Supabase anon key ile GoTrue `/token`/`/signup` doğrudan çağrılabilir (anon key yalnız API env'inde; web'de yok — iyi) → dashboard sertleştirme gerekli: "Allow new users to sign up" KAPAT, rate limits | supabase-auth.service.ts:42; docs/deploy.md:74 bayat (web build-arg) | launch-checklist maddesi + doc düzeltme; anon key'i sır sınıfına al |

## LOW — elle kod doğrulaması (toplu düzeltme adayı)
- `parseCookies` bozuk değerde REST'te 500 (tüm istekler; domain'deki yabancı çerez yeter) — #1 ile birlikte kapanır (cookie.ts:154).
- WS `*.vercel.app` jokeri koşulsuz (REST'te CORS_ALLOW_VERCEL kapılı) — realtime.gateway.ts:43.
- Token dönen akışlarda (change-password/verify/davet) `persistent=true` varsayımı → "Oturumumu açık bırak" kapalıyken bile 30 günlük kalıcı cookie — interceptor.ts:61.
- Logout CSRF muaf (çapraz-site çıkış yaptırma) — csrf.guard.ts:51 (düşük etki).
- CSRF cookie imzasız + `Domain=.rothern.com` → subdomain ele geçirilirse double-submit aşılır (standart zayıflık; HMAC-bağlı CSRF ile kapanır — ayrı iş).
- TOTP şifreleme anahtarı JWT_SECRET türevi → secret rotasyonu tüm authenticator girişlerini kırar (ayrı `TOTP_ENC_KEY` + fallback).
- Kurtarma kodları 40-bit, pepper'sız SHA-256, tüketimi atomik değil — company-auth.service.ts:916.
- 2FA enable/disable parola yeniden-doğrulaması istemiyor; admin'de firma kullanıcısı için "2FA sıfırla" aracı yok.
- Parola politikası akışlar arası tutarsız (signup ≥10+özel / reset ≥8 / admin ≥12).
- `setActive/remove` #8 düşürme koruması dışında (override'lı op-rollü kullanıcı YONETICI'yi pasifleştirebilir).
- Onay zinciri: uygunluk ROL-bazlı, karar İZİN-bazlı → rol kaybında adım askıda (cron yeniden atamaz).
- permissionsOverride legacy anahtarları (buy:*/sell:*) etkili kalıyor.
- Yetim `auth.users` (yarım kayıt) → kalıcı 409, öz-iyileşme aracı yok.
- Web: 401'de derin link kaybı; "açık bırak" kapalıyken sessionStorage snapshot ↔ cookie kapsamı uyumsuz (yeni sekme login'e düşer); persist hydration hatasında boş sayfa; logout backend'i beklemiyor.
- Admin nav bazı sayfaları SUPPORT'a gösterip backend 403 veriyor.
- Test boşlukları: company throttle wiring, CompanyPermissionsGuard wiring, logout+slide, CSRF realm eşleşmesi, interceptor/401 web testleri; makeAuthService mock parolayı doğrulamıyor (bilinen refactor borcu).
- Doc drift: CLAUDE.md "3 auth alanı tenant/admin/supplier" ve "Buyer self-register YOK" (birleşik Company gerçekliğiyle çelişir), "JWT 7d" vs render.yaml 1h, SUPABASE_JWT_SECRET ölü env, .env.production.example app.rothern.com.

## ÇÜRÜTÜLEN / BİLİNÇLİ KABUL
- Login gövdesinde JWT + Bearer fallback: yalnız kimlik bilgisi girilen yanıtlarda; XSS parolayı zaten alır; TTL 1h + tv iptali → INFO (isteğe bağlı sertleştirme: gövdeden `token`'ı düş, Bearer fallback'i kaldır).
- `/company/approvals/all` izin kapısız: Faz O bilinçli olarak yalnız DETAY uçlarını daralttı; liste verisi zaten `listings`/`orders` listelerinde açık → kabul.
- TanStack Query önbelleği hesap değişiminde: gerçek akışta ulaşılamaz (tam navigasyon / clear) → INFO hijyen.

## DURUM — Dalga B (kısmi, 2026-08-23)
Kapatılan LOW'lar: kurtarma kodları pepper'lı v2 hash + atomik tüketim (`7c28c42a`); setActive/remove'da yönetici-hedef koruması (`d80f604b`); doküman sapmaları (CLAUDE.md realm/self-signup/kapalı-zarf, ölü SUPABASE_JWT_SECRET, NEXT_PUBLIC_SUPABASE notları, Supabase signup kapatma adımı — `2b35e3ea`). Kalan Dalga B: davet token hash+POST taşıma, logout CSRF (kabul edilebilir), parola politikası uyumu, onay zinciri rol↔izin (Parça 8), legacy override anahtarları, yetim auth.users aracı, web 401/sessionStorage/hydration (Parça 10), admin nav drift (Parça 9), test boşlukları.

## DURUM (2026-08-23) — Dalga A UYGULANDI
#1, #2, #3, #4, #5, #6 (log maskeleme; hash'li saklama Dalga B), #7, #8, #9, #10 düzeltildi + regresyon testleri: `test/unit/auth-hardening-2026-08-23.spec.ts`, `test/integration/realtime-gateway-bad-cookie.spec.ts`, `email-code-cap.spec.ts`, `admin-session-revocation.spec.ts`, `roles-ownership.spec.ts` (+2). LOW'lardan kapatılan: WS `*.vercel.app` kapısı, "oturumu açık bırak" tercihinin korunması, parseCookies REST 500'leri. #11 + kalan LOW/INFO: Dalga B / kullanıcı (Supabase dashboard).

