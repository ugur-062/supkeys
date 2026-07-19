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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
