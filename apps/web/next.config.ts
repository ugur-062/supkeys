import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// V2-7+ güvenlik (OWASP A05) — tamamlayıcı header'lar.
// CSP burada DEĞİL: nonce tabanlı script-src per-request üretilir → src/
// middleware.ts'te set edilir (statik header nonce taşıyamaz). framing/object/
// base sıkılığı orada; unsafe-inline/eval script-src'ten kalktı.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Docker/Coolify: kendine-yeterli minimal sunucu çıktısı (node_modules izlenip
  // .next/standalone'a kopyalanır → ~150MB imaj, `next start` yerine `node
  // server.js`). Monorepo'da workspace bağımlılıkları (@rothern/shared) repo
  // kökünden izlensin diye tracingRoot kök olarak verilir.
  // Vercel kendi çıktısını yönetir; standalone yalnız Docker/Coolify için.
  output: process.env.VERCEL ? undefined : "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // OG kartı fontları (SEO Parça 6): `readFile` ile okunur; izleyici bazen
  // dinamik yolu kaçırır → sunucusuz pakete AÇIKÇA eklenir.
  outputFileTracingIncludes: {
    "/**/opengraph-image": ["./src/lib/seo/og/fonts/*.ttf"],
    "/**/twitter-image": ["./src/lib/seo/og/fonts/*.ttf"],
    "/opengraph-image": ["./src/lib/seo/og/fonts/*.ttf"],
    "/twitter-image": ["./src/lib/seo/og/fonts/*.ttf"],
  },
  // Monorepo workspace paketini DERLEMEYE göm (harici require etme). Aksi halde
  // standalone çıktı @rothern/shared'i kopyalamıyor, symlink ile repo köküne
  // çözüyor → Docker imajında (monorepo yok) runtime'da modül bulunamıyordu.
  transpilePackages: ["@rothern/shared", "@rothern/i18n"],

  /**
   * GÖRSEL OPTİMİZASYONU (Faz 3c).
   *
   * Bugüne kadar her yerde düz `<img>` vardı çünkü `remotePatterns`
   * tanımsızdı ve `next/image` yapılandırılmamış uzak host'u REDDEDİYOR.
   * İki logo için sorun değildi; ürün kataloğu ve ilan görselleriyle birlikte
   * yüzlerce görselli ızgaralar geldi — optimizasyon, responsive `srcset` ve
   * lazy boyutlandırma olmadan mobilde ilk yükleme çöker.
   *
   * Host'lar ENV'DEN türetilir, elle yazılmaz: `R2_PUBLIC_BASE_URL` ortama
   * göre değişiyor (cdn.rothern.com / pub-*.r2.dev / boş). Elle yazsaydık
   * env değiştiğinde görseller sessizce 400 dönerdi.
   *
   * NOT: `pub-*.r2.dev` Türkiye'de engelli — görseller custom domain'den
   * (cdn.rothern.com) servis edilmeli. Bu yüzden yapılandırma env'i olduğu
   * gibi izler; r2.dev'e düşen bir kurulum ZATEN bozuktur ve görünür olmalı.
   */
  images: {
    remotePatterns: [
      process.env.NEXT_PUBLIC_CDN_URL ?? process.env.R2_PUBLIC_BASE_URL,
    ]
      .filter((v): v is string => !!v)
      .flatMap((raw) => {
        try {
          const u = new URL(raw);
          return [
            {
              protocol: u.protocol.replace(":", "") as "http" | "https",
              hostname: u.hostname,
            },
          ];
        } catch {
          // Bozuk env → host eklenmez; görsel `<img>` yoluna düşer.
          return [];
        }
      }),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /**
   * "ihale" → "satın alma talebi" yeniden adlandırmasının URL bacağı
   * (2026-09-01). ESKİ adresler KALICI olarak yenisine yönlenir.
   *
   * Neden şart: gönderilmiş e-postalardaki CTA linkleri eski adresi taşıyor
   * ve o e-postalar geri alınamaz — yönlendirme olmadan kullanıcı 404 görür.
   * Ayrıca kayıtlı yer imleri ve dış bağlantılar da kırılırdı.
   *
   * `permanent: true` → 308 (301'in yöntem-koruyan karşılığı; tarayıcılar
   * 301'de isteği GET'e çeviriyordu). Alt yollar `:path*` ile taşınır, sorgu
   * parametreleri Next tarafından otomatik aktarılır — yani
   * `/…/ihalelerim/abc?tab=2` → `/…/taleplerim/abc?tab=2`.
   */
  /**
   * INDEXNOW ANAHTAR DOSYASI KÖKTEN DE SERVİS EDİLİR — ZORUNLU.
   *
   * IndexNow'da anahtar dosyasının KONUMU, bildirebileceğin adreslerin
   * KAPSAMINI belirler: dosya `/indexnow/<key>.txt` altındaysa yalnız
   * `/indexnow/…` adresleri bildirilebilir. 2026-09-13'te canlıda ölçüldü:
   *   anasayfa           → HTTP 422 "URLs are not related to your site"
   *   /indexnow/… altı   → HTTP 202 kabul
   * Yani kanal kuruluydu ama TEK BİR gerçek ürün/firma/talep adresini bile
   * bildiremiyordu ve bunu sessizce yapıyordu.
   *
   * `afterFiles`: dosya sistemi rotaları ÖNCE çözülür → `/robots.txt`,
   * `/llms.txt`, `/llms-full.txt` kendi rotalarında kalır, buraya düşmez.
   * Desen en az 8 karakter ister (IndexNow anahtar tabanı), o yüzden kısa
   * adlı .txt rotalarıyla çakışmaz.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: "/:anahtar([A-Za-z0-9-]{8,128}).txt",
          destination: "/indexnow/:anahtar.txt",
        },
      ],
      fallback: [],
    };
  },

  async redirects() {
    // i18n Faz 1: her yönlendirmenin `/en/…` ve `/ru/…` kopyası — eski adres
    // hangi dilde açıldıysa aynı dilde yeni adrese gitsin (Türkçe ön eksiz).
    const withLocales = (
      rules: { source: string; destination: string; permanent: boolean }[],
    ) => [
      ...rules,
      ...["en", "ru"].flatMap((l) =>
        rules.map((r) => ({ ...r, source: `/${l}${r.source}`, destination: `/${l}${r.destination}` })),
      ),
    ];
    return withLocales([
      // Firma dizini URL'i menü adıyla hizalandı (2026-09-04): "Firmalar" →
      // `/firmalar`. Eski adres e-posta/dış bağlantılarda olabilir.
      // Kök ve alt yol AYRI (2026-09-22): tek `:path*` kuralı kökte
      // `/firmalar/` üretip ikinci bir 308 zinciri kuruyordu.
      { source: "/tedarikciler", destination: "/firmalar", permanent: true },
      // Şehir firma sayfaları KAPANDI (2026-09-22, üyelik vitrini): kural burada,
      // sayfa içi permanentRedirect üst segmentin `loading.tsx` akışında 200 dönüyordu.
      { source: "/firmalar/sehir/:il", destination: "/firmalar", permanent: true },
      {
        source: "/tedarikciler/:path+",
        destination: "/firmalar/:path+",
        permanent: true,
      },
      // Kısa yollar — public header `/company/login` ve `/company/kayit`e
      // bağlanıyor; ziyaretçi elle `/giris` `/kayit` yazınca 404 alıyordu.
      // Talep detayı kanonik adresi `/talep/rot-000042-başlık` (numara önde,
      // sitemap ile aynı). `/alim-talepleri/<numara>` kısa yolu oraya döner.
      { source: "/alim-talepleri/:number(rot-\\d+)", destination: "/talep/:number", permanent: true },
      // Detaylı sihirbaz KALDIRILDI (2026-09-19): eski adres hızlı karta (sorgu korunur).
      { source: "/company/satinalma/taleplerim/yeni/detayli", destination: "/company/satinalma/taleplerim/yeni", permanent: true },
      { source: "/giris", destination: "/company/login", permanent: true },
      { source: "/kayit", destination: "/company/kayit", permanent: true },
      {
        source: "/company/satinalma/ihalelerim/:path*",
        destination: "/company/satinalma/taleplerim/:path*",
        permanent: true,
      },
      {
        source: "/company/satis/acik-ihaleler/:path*",
        destination: "/company/satis",
        permanent: true,
      },
      {
        source: "/company/satinalma/sablonlar/ihale/:path*",
        destination: "/company/satinalma/sablonlar/talep/:path*",
        permanent: true,
      },
      // Satış ilanı KALDIRILDI (2026-09-04): eski herkese açık liste/detay
      // adresleri ve panel şablonu ürün dizinine/Ürünlerim'e döner — gönderilmiş
      // e-posta ve dış bağlantılar 404 yerine anlamlı bir sayfaya insin.
      // Şirketim alanı (2026-09-05): Profilim'in iki portal adresi ve satınalma
      // raporları `/company/sirketim/*` altına taşındı.
      { source: "/company/satinalma/profilim", destination: "/company/sirketim/profil", permanent: true },
      { source: "/company/satis/profilim", destination: "/company/sirketim/profil", permanent: true },
      { source: "/company/satinalma/raporlar", destination: "/company/sirketim/raporlar", permanent: true },
      { source: "/company/satinalma/raporlar/:path*", destination: "/company/sirketim/raporlar/:path*", permanent: true },
      // Onay akışları Onaylar sayfasının kendi görünümünde (2026-09-10); eski
      // Ayarlar rotası istemci-yönlendirme stub'uydu, silindi.
      { source: "/company/ayarlar/onay-akislari", destination: "/company/onaylar?tab=flows", permanent: true },
      // NOT: `/company/satinalma/urunler` 2026-09-05'te anasayfaya 308'lenmişti;
      // pazar katmanı brifiyle (2026-09-07) GERİ AÇILDI — ürün dizini yine kendi
      // sayfası. Yönlendirme KALDIRILDI, yoksa yeni rota kendi kendine 308 verirdi.
      { source: "/satilik", destination: "/urunler", permanent: true },
      { source: "/ilan/:path*", destination: "/urunler", permanent: true },
      {
        source: "/company/satis/ilanlarim/:path*",
        destination: "/company/satis/urunlerim",
        permanent: true,
      },
      {
        source: "/company/satis/sablonlar/:path*",
        destination: "/company/satis/urunlerim",
        permanent: true,
      },
      {
        source: "/company/satinalma/satin-al/:path*",
        destination: "/company/satinalma/urunler",
        permanent: true,
      },
      {
        // Satınalma "Tekliflerim" = SATIŞ ilanlarına verdiğim teklifler
        // sayfasıydı; satış tarafındaki "Satış Tekliflerim" duruyor.
        source: "/company/satinalma/tekliflerim/:path*",
        destination: "/company/satis/tekliflerim",
        permanent: true,
      },
      {
        // Açık Talepler sayfası satış ANASAYFASINA katıldı (2026-09-05);
        // sorgu (?q=, ?kategori=) aynen taşınır.
        source: "/company/satis/acik-talepler/:path*",
        destination: "/company/satis",
        permanent: true,
      },
      {
        // Satış raporları = SATIŞ ilanı raporlarıydı; satın alma raporları kaldı.
        source: "/company/satis/raporlar/:path*",
        destination: "/company/satinalma/raporlar",
        permanent: true,
      },
    ]);
  },
};

/**
 * Sentry sarmalayıcı (2026-09-12) — YALNIZ `SENTRY_AUTH_TOKEN` varken devreye
 * girer. Tek işi kaynak haritası yüklemek: yoksa yığın izleri küçültülmüş
 * halde okunmaz olur. Jeton yoksa derleme AYNEN eskisi gibi kalır, yani CI ve
 * mevcut Vercel derlemeleri etkilenmez. Hata yakalama sarmalayıcıdan BAĞIMSIZ
 * çalışır (`instrumentation-client.ts`).
 */
// Çok dillilik (i18n Faz 0): `src/i18n/request.ts` istek dilini ve katalogları
// verir. Faz 0'da YÖNLENDİRME YOK (middleware/[locale] segmenti Faz 1) — bkz.
// docs/plan-i18n.md. Sentry sarmalayıcısı EN DIŞTA kalır.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const configWithIntl = withNextIntl(nextConfig);

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(configWithIntl, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // SESSİZ DEĞİL (2026-09-16): `silent: true` yükleme HATASINI da yutuyordu.
      // pnpm 10 `@sentry/cli`nin kurulum betiğini atladığı için yükleyici binary
      // hiç inmemiş olabilir ve derleme yine YEŞİL görünür — kaynak haritası
      // yüklenmediğinde yığın izi okunmaz, bunu ancak ilk gerçek hatada fark
      // ederdik. Artık yükleme çıktısı derleme günlüğünde görünür.
      silent: false,
      widenClientFileUpload: true,
      disableLogger: true,
      // Kaynak haritaları YÜKLENİR ama sunucuya SERVİS EDİLMEZ (gizli kalır).
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : configWithIntl;
