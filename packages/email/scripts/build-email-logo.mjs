// E-posta logosunu üretir: src/assets/logo.ts (base64 PNG, CID gömme).
//
// Logo kartın BAŞLIĞINDA, beyaz kart zemininin üstünde durur (2026-10-04,
// kullanıcı: "logo arka temayla aynı renk bile değil, dikdörtgen çerçeve gibi").
// Görselin kendi zemini kartla AYNI beyaz → açık modda zemin görünmez, yalnız
// siyah logo okunur. Neden yine de kendi zemini var: e-posta istemcileri koyu
// modda kartı koyulaştırır ama görseli değiştirmez; şeffaf zeminli siyah logo
// kaybolur (2026-09-11 Gmail iOS'ta görüldü). Koyu kartta zemin, köşeleri
// yuvarlak küçük bir beyaz rozet olarak bilinçli durur.
//
// Koşum (paket dizininden): node scripts/build-email-logo.mjs
// Önizleme: PREVIEW_DIR=/tmp/x node scripts/build-email-logo.mjs
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, "../../..");
const SRC = path.join(REPO, "apps/web/public/rothern-logo-trans.png");
const OUT = path.join(here, "../src/assets/logo.ts");

// sharp kök bağımlılık değil (Next'in geçişli bağımlılığı) → pnpm deposundan
// en yeni sürüm. Sabit yol yazılmaz: sürüm değişince betik kırılıyordu.
function loadSharp() {
  const store = path.join(REPO, "node_modules/.pnpm");
  const dirs = readdirSync(store)
    .filter((d) => /^sharp@\d/.test(d))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (dirs.length === 0) throw new Error("sharp bulunamadı (pnpm install?)");
  const require = createRequire(import.meta.url);
  return require(path.join(store, dirs[0], "node_modules/sharp"));
}
const sharp = loadSharp();

// Görüntülenen boyut (layout.tsx `LOGO_WIDTH`×`LOGO_HEIGHT`) 142×40 → 2x.
// Logo yüksekliği 26 px; yatay boşluk dar tutuldu ki açık modda logo metin
// sütunuyla neredeyse aynı hizada başlasın, koyu modda rozet dengeli dursun.
const SCALE = 2;
const W = 142 * SCALE;
const H = 40 * SCALE;
const R = 10 * SCALE;
const PAD_X = 8 * SCALE;
const PAD_Y = 7 * SCALE;

const logo = await sharp(await readFile(SRC))
  .trim()
  .resize({ width: W - PAD_X * 2, height: H - PAD_Y * 2, fit: "inside", kernel: "lanczos3" })
  .png()
  .toBuffer();
const card = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="${R}" ry="${R}" fill="#FFFFFF"/></svg>`,
);
const png = await sharp(card)
  .composite([{ input: logo, gravity: "centre" }])
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();
const b64 = png.toString("base64");
const lines = b64.match(/.{1,120}/g).map((l) => `  "${l}"`).join(" +\n");
await writeFile(
  OUT,
  `// AUTO-GENERATED (scripts/build-email-logo.mjs) — inline e-posta logosu (CID gömme).
// Beyaz yuvarlak zeminli siyah logo (${W}×${H}, ${W / SCALE}×${H / SCALE} @${SCALE}x): açık modda
// zemin kartla aynı beyaz (görünmez); koyu modda istemci kartı koyulaştırsa da
// görsel değişmez, logo küçük beyaz bir rozet içinde okunur kalır.
// Kaynak: apps/web/public/rothern-logo-trans.png
export const LOGO_CID = "rothern-logo";
export const LOGO_FILENAME = "rothern-logo.png";
/** Görüntülenen boyut (px) — HTML \`width\`/\`height\` öznitelikleri. */
export const LOGO_WIDTH = ${W / SCALE};
export const LOGO_HEIGHT = ${H / SCALE};
export const ROTHERN_LOGO_BASE64 =
${lines};
`,
);
// Görsel kontrol: koyu ve açık zeminde önizleme.
const previewDir = process.env.PREVIEW_DIR;
if (previewDir) {
  for (const [name, bg] of [["dark", "#1c1c1e"], ["light", "#FFFFFF"]]) {
    await sharp({ create: { width: W + 80, height: H + 80, channels: 4, background: bg } })
      .composite([{ input: png, gravity: "centre" }])
      .png()
      .toFile(path.join(previewDir, `email-logo-${name}.png`));
  }
}
console.log("logo.ts yazıldı:", png.length, "bayt");
