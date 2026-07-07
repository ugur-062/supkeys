import path from "node:path";
import type { NextConfig } from "next";

// V2-7+ güvenlik (OWASP A05) — CSP + tamamlayıcı header'lar.
// Kaynak yönergeleri (script/style/connect/img) Next.js + API/Supabase/R2'yi
// kırmamak için esnek tutuldu; framing/object/base sıkı (clickjacking,
// plugin & base-tag injection koruması). İleride nonce tabanlı script-src'e
// sıkılaştırılabilir.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http: ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
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
  // server.js`). Monorepo'da workspace bağımlılıkları (@supkeys/shared) repo
  // kökünden izlensin diye tracingRoot kök olarak verilir.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Monorepo workspace paketini DERLEMEYE göm (harici require etme). Aksi halde
  // standalone çıktı @supkeys/shared'i kopyalamıyor, symlink ile repo köküne
  // çözüyor → Docker imajında (monorepo yok) runtime'da modül bulunamıyordu.
  transpilePackages: ["@supkeys/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
