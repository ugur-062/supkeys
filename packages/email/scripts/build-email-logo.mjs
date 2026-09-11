// E-posta logosunu üretir: src/assets/logo.ts (base64 PNG, CID gömme).
// Neden kendi zemini var: e-posta istemcileri koyu modda arka planı
// koyulaştırır ama görseli değiştirmez; şeffaf zeminli siyah logo kaybolur
// (2026-09-11 Gmail iOS'ta görüldü). Beyaz yuvarlak kart görselin İÇİNDE →
// her istemcide, her modda okunur. Koşum: node scripts/build-email-logo.mjs
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(path.join(process.cwd(), "../../node_modules/.pnpm/sharp@0.35.3_@types+node@22.19.17/node_modules/sharp"));
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, "../../../apps/web/public/rothern-logo-trans.png");
const OUT = path.join(here, "../src/assets/logo.ts");

// Görüntülenen boyut 170×50 (layout.tsx) → 2x: 340×100. Kart 340×100, r=16.
const W = 340, H = 100, R = 16, PAD_X = 28, PAD_Y = 22;
const logo = await sharp(await readFile(SRC))
  .trim()
  .resize({ width: W - PAD_X * 2, height: H - PAD_Y * 2, fit: "inside" })
  .png()
  .toBuffer();
const card = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="${R}" ry="${R}" fill="#FFFFFF"/></svg>`,
);
const png = await sharp(card).composite([{ input: logo, gravity: "centre" }]).png({ compressionLevel: 9 }).toBuffer();
const b64 = png.toString("base64");
const lines = b64.match(/.{1,120}/g).map((l) => `  "${l}"`).join(" +\n");
await writeFile(
  OUT,
  `// AUTO-GENERATED (scripts/build-email-logo.mjs) — inline e-posta logosu (CID gömme).
// Beyaz yuvarlak kart ZEMİNLİ siyah logo (${W}×${H}, 170×50 @2x): koyu modda
// istemci arka planı koyulaştırsa da görsel değişmez, logo okunur kalır.
// Kaynak: apps/web/public/rothern-logo-trans.png
export const LOGO_CID = "rothern-logo";
export const LOGO_FILENAME = "rothern-logo.png";
export const ROTHERN_LOGO_BASE64 =
${lines};
`,
);
// Görsel kontrol: koyu ve açık zeminde önizleme.
const previewDir = process.env.PREVIEW_DIR;
if (previewDir) {
  for (const [name, bg] of [["dark", "#1c1c1e"], ["light", "#F8FAFC"]]) {
    await sharp({ create: { width: W + 80, height: H + 80, channels: 4, background: bg } })
      .composite([{ input: png, gravity: "centre" }]).png().toFile(path.join(previewDir, `email-logo-${name}.png`));
  }
}
console.log("logo.ts yazıldı:", png.length, "bayt");
