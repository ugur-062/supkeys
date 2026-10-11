// E-posta logolarını üretir: src/assets/logo.ts (base64 PNG, CID gömme).
//
// Logo kartın BAŞLIĞINDA, beyaz kart zemininin üstünde durur (2026-10-04,
// kullanıcı: "logo arka temayla aynı renk bile değil, dikdörtgen çerçeve gibi").
// Açık görselin kendi zemini kartla AYNI beyaz → açık modda zemin görünmez.
// Neden yine de kendi zemini var: Gmail/Outlook koyu modda kartı koyulaştırır
// ama görseli değiştirmez; şeffaf zeminli siyah logo kaybolur (2026-09-11
// Gmail iOS'ta görüldü). Medya sorgusunu okuyan istemciler için ayrıca şeffaf
// zeminli açık renkli ikinci bir görsel üretilir (aşağıda).
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

// İKİ görsel (2026-10-04 ikinci tur, inceleme: "koyu modda logo hâlâ beyaz,
// köşeleri yuvarlak bir dikdörtgen; üstelik metin sütununun 8 px soluna
// kaymış"):
//  - AÇIK (varsayılan, `cid:rothern-logo`): beyaz zeminli siyah logo. Açık
//    modda zemin kartla aynı beyaz → görünmez. Medya sorgusunu okumayan ve
//    zemini kendisi koyulaştıran istemcilerde (Gmail, Outlook) beyaz zemin
//    küçük bir "chip" olarak kalır → iç boşluk dar (5 px) ve chip metin
//    sütunuyla AYNI hizada başlar (layout'ta eksi telafi yok).
//  - KOYU (`cid:rothern-logo-dark`): şeffaf zeminli, açık (zinc-50) logo;
//    `prefers-color-scheme: dark` okuyan istemcilerde (Apple Mail, iOS Mail)
//    ve Outlook.com koyu modunda (`[data-ogsc]`) açığın yerine gösterilir.
//    Aynı boyut ve aynı iç boşluk → takas edilince logo yerinden oynamaz.
// Görüntülenen boyut 136×36 (logo yüksekliği 26 px), dosya 2x.
const SCALE = 2;
const GLYPH_H = 26 * SCALE;
const PAD_X = 5 * SCALE;
const PAD_Y = 5 * SCALE;
const R = 8 * SCALE;
const DARK_GLYPH = { r: 0xfa, g: 0xfa, b: 0xfa };

const scaled = await sharp(await readFile(SRC))
  .trim()
  .resize({ height: GLYPH_H, kernel: "lanczos3" })
  .png()
  .toBuffer({ resolveWithObject: true });
// Tek sayılı genişlik 1x'te yarım piksel verir → sağa 1 px şeffaf.
const glyph = await sharp(scaled.data)
  .extend({ right: scaled.info.width % 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer({ resolveWithObject: true });
const GW = glyph.info.width;
const W = GW + PAD_X * 2;
const H = GLYPH_H + PAD_Y * 2;

const chip = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="${R}" ry="${R}" fill="#FFFFFF"/></svg>`,
);
const lightPng = await sharp(chip)
  .composite([{ input: glyph.data, left: PAD_X, top: PAD_Y }])
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();

// Koyu: logonun alfa kanalı korunur, renk zinc-50'ye boyanır.
const alpha = await sharp(glyph.data).ensureAlpha().extractChannel("alpha").raw().toBuffer();
const lightGlyph = await sharp({ create: { width: GW, height: GLYPH_H, channels: 3, background: DARK_GLYPH } })
  .joinChannel(alpha, { raw: { width: GW, height: GLYPH_H, channels: 1 } })
  .png()
  .toBuffer();
const darkPng = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: lightGlyph, left: PAD_X, top: PAD_Y }])
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();

const b64 = (png) =>
  png
    .toString("base64")
    .match(/.{1,120}/g)
    .map((l) => `  "${l}"`)
    .join(" +\n");
await writeFile(
  OUT,
  `// AUTO-GENERATED (scripts/build-email-logo.mjs) — inline e-posta logoları (CID gömme).
// ${W}×${H} (${W / SCALE}×${H / SCALE} @${SCALE}x), aynı boyut ve aynı iç boşluk:
//  - açık: beyaz yuvarlak zeminli siyah logo (varsayılan; açık modda zemin kartla
//    aynı beyaz, zemini kendisi koyulaştıran istemcide küçük beyaz chip);
//  - koyu: şeffaf zeminli zinc-50 logo (prefers-color-scheme: dark / Outlook.com).
// Kaynak: apps/web/public/rothern-logo-trans.png
export const LOGO_CID = "rothern-logo";
export const LOGO_FILENAME = "rothern-logo.png";
export const LOGO_DARK_CID = "rothern-logo-dark";
export const LOGO_DARK_FILENAME = "rothern-logo-dark.png";
/** Görüntülenen boyut (px) — HTML \`width\`/\`height\` öznitelikleri. */
export const LOGO_WIDTH = ${W / SCALE};
export const LOGO_HEIGHT = ${H / SCALE};
export const ROTHERN_LOGO_BASE64 =
${b64(lightPng)};
export const ROTHERN_LOGO_DARK_BASE64 =
${b64(darkPng)};
`,
);
// Görsel kontrol: koyu ve açık zeminde önizleme.
const previewDir = process.env.PREVIEW_DIR;
if (previewDir) {
  for (const [name, bg] of [["dark", "#18181b"], ["gmaildark", "#121212"], ["light", "#FFFFFF"]]) {
    await sharp({ create: { width: W + 80, height: H * 2 + 120, channels: 4, background: bg } })
      .composite([
        { input: lightPng, left: 40, top: 40 },
        { input: darkPng, left: 40, top: H + 80 },
      ])
      .png()
      .toFile(path.join(previewDir, `email-logo-${name}.png`));
  }
}
console.log("logo.ts yazıldı:", W / SCALE, "×", H / SCALE, "—", lightPng.length, "+", darkPng.length, "bayt");
