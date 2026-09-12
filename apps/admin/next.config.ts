import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// V2-7+ güvenlik (OWASP A05) — tamamlayıcı header'lar (web ile aynı).
// CSP burada DEĞİL: nonce tabanlı script-src per-request üretilir → src/
// middleware.ts'te set edilir (statik header nonce taşıyamaz).
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
  // Docker/Coolify: kendine-yeterli minimal sunucu çıktısı (bkz. web config).
  // Vercel kendi çıktısını yönetir; standalone yalnız Docker/Coolify için.
  output: process.env.VERCEL ? undefined : "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

/**
 * Sentry sarmalayıcı (2026-09-12) — YALNIZ `SENTRY_AUTH_TOKEN` varken devreye
 * girer. Tek işi kaynak haritası yüklemek: yoksa yığın izleri küçültülmüş
 * halde okunmaz olur. Jeton yoksa derleme AYNEN eskisi gibi kalır, yani CI ve
 * mevcut Vercel derlemeleri etkilenmez. Hata yakalama sarmalayıcıdan BAĞIMSIZ
 * çalışır (`instrumentation-client.ts`).
 */
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      disableLogger: true,
      // Kaynak haritaları YÜKLENİR ama sunucuya SERVİS EDİLMEZ (gizli kalır).
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;
