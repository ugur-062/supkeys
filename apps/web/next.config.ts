import path from "node:path";
import type { NextConfig } from "next";

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
  // Monorepo workspace paketini DERLEMEYE göm (harici require etme). Aksi halde
  // standalone çıktı @rothern/shared'i kopyalamıyor, symlink ile repo köküne
  // çözüyor → Docker imajında (monorepo yok) runtime'da modül bulunamıyordu.
  transpilePackages: ["@rothern/shared"],

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
  async redirects() {
    return [
      // Firma dizini URL'i menü adıyla hizalandı (2026-09-04): "Firmalar" →
      // `/firmalar`. Eski adres e-posta/dış bağlantılarda olabilir.
      {
        source: "/tedarikciler/:path*",
        destination: "/firmalar/:path*",
        permanent: true,
      },
      {
        source: "/company/satinalma/ihalelerim/:path*",
        destination: "/company/satinalma/taleplerim/:path*",
        permanent: true,
      },
      {
        source: "/company/satis/acik-ihaleler/:path*",
        destination: "/company/satis/acik-talepler/:path*",
        permanent: true,
      },
      {
        source: "/company/satinalma/sablonlar/ihale/:path*",
        destination: "/company/satinalma/sablonlar/talep/:path*",
        permanent: true,
      },
      {
        source: "/company/satis/sablonlar/ihale/:path*",
        destination: "/company/satis/sablonlar/ilan/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
