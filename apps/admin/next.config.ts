import path from "node:path";
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

export default nextConfig;
