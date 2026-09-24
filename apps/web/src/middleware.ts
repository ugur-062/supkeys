import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { isPublicRoute } from "@/lib/public-routes";

/**
 * i18n Faz 1: dil ön eki yönlendirmesi (next-intl) CSP ile AYNI middleware'de.
 * Sıra: önce nonce/CSP istek başlıklarına yazılır (next-intl yanıtı
 * `request.headers`ı aynen aktarır), sonra next-intl kararı (ön eksiz Türkçe
 * yolu `/tr/...`e yeniden yazar, `/en/...`i geçirir), en son yanıt başlıkları.
 * Kök dışı rota işleyicileri (api, sitemap, robots, llms, indexnow) ve uzantılı
 * dosyalar next-intl'e GİRMEZ — girse `/tr/sitemap.xml`e yazılıp 404 olurdu.
 */
const intlMiddleware = createMiddleware(routing);

const INTL_SKIP = [
  /^\/api(\/|$)/,
  /^\/sitemaps(\/|$)/,
  /^\/sitemap\.xml$/,
  /^\/robots\.txt$/,
  /^\/llms(-full)?\.txt$/,
  /^\/indexnow(\/|$)/,
  /^\/_next(\/|$)/,
  /^\/_vercel(\/|$)/,
  /\/[^/]*\.[a-zA-Z0-9]+$/, // uzantılı dosya (public/ varlıkları)
];

function skipsIntl(pathname: string): boolean {
  return INTL_SKIP.some((re) => re.test(pathname));
}

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
/**
 * next-intl'in yönlendirmeleri 307 döner (kanonik olmayan dil biçimi
 * `/en/urunler` → `/en/products`, `/products` → `/urunler`, `/tr/x` → `/x`).
 * Hepsi KALICI kanonikleştirmedir; arama motoru ve tarayıcı 308 ile hedefi
 * öğrensin (307 her seferinde yeniden taranır ve sinyal aktarmaz). Başlıklar
 * (Location + next-intl'in dil çerezi) aynen taşınır.
 */
export function permanentize(response: NextResponse): NextResponse {
  if (response.status !== 307 || !response.headers.get("location")) return response;
  return new NextResponse(null, { status: 308, headers: response.headers });
}

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const pathname = request.nextUrl.pathname;
  // Public rota → nonce ÜRETME. Üretip kullanmamak, statik HTML'i nonce'lı
  // CSP ile servis etme hatasına açık kapı bırakırdı. (`isPublicRoute` dil
  // ön ekini kendi soyar.)
  const publicRoute = isPublicRoute(pathname);
  const nonce = publicRoute
    ? null
    : Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev);

  if (nonce) {
    // Next.js nonce'ı BU header'dan okur; public rotada set edilmez ki
    // framework nonce basmaya kalkıp statik çıktıyı kirletmesin. İstek
    // başlığına yazılır: next-intl yanıtı `request.headers`ı aynen taşır.
    request.headers.set("x-nonce", nonce);
    request.headers.set("Content-Security-Policy", csp);
  }

  const response = skipsIntl(pathname)
    ? NextResponse.next({ request: { headers: request.headers } })
    : permanentize(intlMiddleware(request));

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-dbg", `${pathname}|${String(publicRoute)}|${nonce ? "nonce" : "no-nonce"}`);
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
    // API ve statik varlıklar hariç tüm rotalar — PREFETCH DAHİL.
    //
    // Eskiden `missing: [next-router-prefetch, purpose: prefetch]` ile
    // ön yükleme istekleri middleware'den muaf tutuluyordu (CSP nonce'u
    // boşa üretmemek için). i18n Faz 1'den beri (2026-09-23) bütün sayfalar
    // `[locale]` altında ve Türkçe adresler ÖN EKSİZ: `/urunler`ı `/tr/urunler`a
    // yeniden yazan şey bu middleware'deki next-intl. Ön yükleme muaf kalınca
    // `<Link>` ön yüklemeleri ham yola gidiyor, `[locale]="urunler"` gibi
    // yanlış eşleşip 404 dönüyordu; tıklanınca sayfa "Sayfa bulunamadı"
    // açılıyordu (staging'de ölçüldü: `/urunler?_rsc=…` + `Next-Router-Prefetch`
    // → 404, `/en/urunler` → 200). Nonce'un ön yüklemede üretilmesinin zararı
    // yok — gezinti yükleri satır içi script taşımaz.
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
