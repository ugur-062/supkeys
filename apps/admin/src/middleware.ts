import { NextRequest, NextResponse } from "next/server";

/**
 * CSP nonce (OWASP A05 / XSS derinlik savunması) — script-src'ten
 * 'unsafe-inline'/'unsafe-eval' kaldırıldı; her istekte taze nonce üretilir ve
 * Next.js kendi framework/hydration inline script'lerine bu nonce'ı otomatik
 * basar (request'teki CSP header'ından 'nonce-…' okuyarak). Bu yüzden CSP
 * statik next.config header'ından BURAYA taşındı — statik header per-request
 * nonce taşıyamaz. Not: nonce → sayfalar dinamik render olur (admin zaten
 * tümüyle authed/dinamik, kayıp yok).
 *
 * 'strict-dynamic': nonce'lı bootstrap'ın yüklediği alt chunk'lar zincirle
 * güvenilir sayılır (Next chunk yükleme). 'self' eski tarayıcı fallback'i.
 * 'unsafe-eval' YALNIZ dev'de (React hata-ayıklama eval'i); üretimde YOK.
 * style-src 'unsafe-inline' bilinçli KALIR (Next/font + UI kütüphaneleri
 * nonce'suz inline <style> enjekte eder; stil-XSS riski script'e göre düşük).
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

  // Nonce'ı request header'ına koy → Next SSR sırasında okuyup kendi inline
  // script'lerine basar. Aynı CSP hem request (Next okusun) hem response'a.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // API, statik varlıklar ve prefetch'ler hariç tüm rotalar — gereksiz
    // dinamik render'ı önlemek için statik asset'lere CSP/nonce basılmaz.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
