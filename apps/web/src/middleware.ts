import { NextRequest, NextResponse } from "next/server";
import { isPublicRoute } from "@/lib/public-routes";

/**
 * CSP — İKİ profil, tek yerden. Ayrımın kaynağı `lib/public-routes.ts`.
 *
 * PANEL (varsayılan, giriş gerektiren her şey) — nonce + 'strict-dynamic':
 *   script-src'ten 'unsafe-inline'/'unsafe-eval' kaldırıldı; her istekte taze
 *   nonce üretilir, Next.js kendi bootstrap/hydration inline script'lerine bunu
 *   otomatik basar (request'teki CSP header'ından 'nonce-…' okuyarak). CSP
 *   statik next.config header'ından BURAYA taşındı — statik header per-request
 *   nonce taşıyamaz. Nonce ⇒ o rotalar DİNAMİK render olmak ZORUNDA.
 *
 * PUBLIC (SEO/GEO sayfaları) — nonce YOK, 'unsafe-inline' VAR:
 *   Nonce ile CDN önbelleği yapısal olarak uyuşmaz (nonce per-request, önbellek
 *   per-URL). SEO/GEO'nun ön koşulu statik/ISR + kenar önbelleği olduğu için
 *   bu rotalarda nonce'tan vazgeçiyoruz. Takasın bedeli bilinçli ve sınırlı:
 *     · bu sayfalarda oturum çerezi JS'ten okunamaz (httpOnly), DOM'da CSRF
 *       token veya kişisel veri yok — çalınacak bir şey yok;
 *     · kullanıcı metnini React zaten kaçırıyor, JSON-LD `serializeJsonLd` ile
 *       kaçırılıyor (bkz. json-ld.test.ts);
 *     · kalan risk defacement/oltalama sınıfında, oturum ele geçirme değil.
 *   'strict-dynamic' YOK: varlığında 'unsafe-inline' yok sayılırdı.
 *
 * 'unsafe-eval' YALNIZ dev'de (React hata-ayıklama eval'i); üretimde YOK.
 * style-src 'unsafe-inline' her iki profilde bilinçli KALIR (Next/font + UI
 * kütüphaneleri nonce'suz inline <style> enjekte eder; stil-XSS riski düşük).
 */
function buildCsp(nonce: string | null, isDev: boolean): string {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
        isDev ? " 'unsafe-eval'" : ""
      }`
    : `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: http: ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * NOT (ölçüldü, 2026-09-02): `Cache-Control`'ü BURADAN vermeyi denedim —
 * ÇALIŞMIYOR. Next dinamik render edilen sayfalara kendi
 * `private, no-cache, no-store`'unu middleware'den SONRA yazıyor ve bizimkini
 * eziyor (`next.config` `headers()` yolu da aynı sebeple çalışmaz; Next bunu
 * belgelendiriyor). Süzgeçli liste sayfaları bu yüzden kenar önbelleğine
 * giremiyor. Doğru çözüm başlık değil ROTA BİÇİMİ: süzgeci sorgu dizesinden
 * çıkarıp yol parçasına taşımak (`/alim-talepleri/kategori/<kod>`) o sayfaları
 * statik/ISR yapar. Long-tail turunda yapılacak.
 */
export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  // Public rota → nonce ÜRETME. Üretip kullanmamak, statik HTML'i nonce'lı
  // CSP ile servis etme hatasına açık kapı bırakırdı.
  const publicRoute = isPublicRoute(request.nextUrl.pathname);
  const nonce = publicRoute
    ? null
    : Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    // Next.js nonce'ı BU header'dan okur; public rotada set edilmez ki
    // framework nonce basmaya kalkıp statik çıktıyı kirletmesin.
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // Dalga B-4: HSTS hiçbir yerde set edilmiyordu (API'de helmet var, ön yüzde
  // yoktu). Tarayıcı, alan adını bir yıl boyunca yalnız HTTPS üzerinden
  // konuşmaya zorlar → ilk isteğin http'ye düşüp çerezi sızdırdığı SSL-stripping
  // penceresi kapanır. Yalnız HTTPS yanıtlarında anlamlıdır (http'de yok sayılır).
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  // Tarayıcının MIME tahminini kapat (yüklenen dosya yanlış tiple servis
  // edilse bile script olarak yorumlanmasın).
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: [
    // API, statik varlıklar ve prefetch'ler hariç tüm rotalar.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
