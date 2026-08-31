import { NextRequest, NextResponse } from "next/server";

/**
 * CSP nonce (OWASP A05 / XSS derinlik savunması) — script-src'ten
 * 'unsafe-inline'/'unsafe-eval' kaldırıldı; her istekte taze nonce üretilir ve
 * Next.js kendi framework/hydration inline script'lerine bu nonce'ı otomatik
 * basar (request'teki CSP header'ından 'nonce-…' okuyarak). CSP statik
 * next.config header'ından BURAYA taşındı — statik header per-request nonce
 * taşıyamaz. Not: nonce → sayfalar dinamik render olur (public SEO sayfaları
 * dahil; demo/düşük-trafik fazında maliyet kabul edildi).
 *
 * 'strict-dynamic': nonce'lı bootstrap'ın yüklediği alt chunk'lar zincirle
 * güvenilir sayılır. 'self' eski tarayıcı fallback'i. 'unsafe-eval' YALNIZ
 * dev'de (React hata-ayıklama eval'i); üretimde YOK. style-src 'unsafe-inline'
 * bilinçli KALIR (Next/font + UI kütüphaneleri nonce'suz inline <style> enjekte
 * eder; stil-XSS riski script'e göre düşük).
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: http: ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

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
