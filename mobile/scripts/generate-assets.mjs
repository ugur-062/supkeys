// Uygulama ikonu ve açılış görsellerini marka işaretinden üretir (siyah işaret,
// beyaz zemin — web'in icon-512.png'siyle aynı görünüm). Çıktılar depoya yazılıdır;
// işaret değişirse yeniden koş:
//   node mobile/scripts/generate-assets.mjs
// `sharp` kabuğun bağımlılığı değildir; monorepo kurulumundan (pnpm install) okunur.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const pnpmDir = path.join(repo, "node_modules/.pnpm");
const sharpDir = readdirSync(pnpmDir).filter((d) => d.startsWith("sharp@")).sort().at(-1);
if (!sharpDir) throw new Error("sharp not found: run pnpm install at the repo root first");
const sharp = createRequire(import.meta.url)(path.join(pnpmDir, sharpDir, "node_modules/sharp"));

const mark = readFileSync(path.join(repo, "apps/web/public/rothern-icon.svg"), "utf8").replace(
  /currentColor/g,
  "#0A0A0A",
);
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** İşaret, `width`×`height` tuvalin ortasında; `ratio` = işaretin kısa kenara oranı. */
async function compose(width, height, ratio, background) {
  const size = Math.round(Math.min(width, height) * ratio);
  const logo = await sharp(Buffer.from(mark), { density: 1200 }).resize(size, size).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background } }).composite([
    { input: logo, gravity: "centre" },
  ]);
}

const write = async (image, file, opaque = false) => {
  const out = path.resolve(here, "..", file);
  await (opaque ? image.flatten({ background: WHITE }).removeAlpha() : image).png().toFile(out);
};

const res = "android/app/src/main/res";
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, px] of Object.entries(DENSITIES)) {
  await write(await compose(px, px, 0.68, WHITE), `${res}/mipmap-${density}/ic_launcher.png`);
  // Yuvarlak ikon: daire maskesi.
  const circle = Buffer.from(
    `<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}"/></svg>`,
  );
  // İki composite aynı zincirde birbirini ezer → önce düzleştir, sonra maskele.
  const square = await (await compose(px, px, 0.62, WHITE)).png().toBuffer();
  const round = sharp(square).composite([{ input: circle, blend: "dest-in" }]);
  await write(round, `${res}/mipmap-${density}/ic_launcher_round.png`);
  // Uyarlanabilir ikon ön planı: 108dp tuval, güvenli alan ortadaki 66dp.
  const fg = Math.round((px * 108) / 48);
  await write(await compose(fg, fg, 0.46, CLEAR), `${res}/mipmap-${density}/ic_launcher_foreground.png`);
}

const SPLASH = {
  drawable: [480, 320],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  await write(await compose(w, h, 0.3, WHITE), `${res}/${dir}/splash.png`, true);
}

const ios = "ios/App/App/Assets.xcassets";
// App Store ikonu saydamlık taşıyamaz.
await write(await compose(1024, 1024, 0.68, WHITE), `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, true);
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await write(await compose(2732, 2732, 0.16, WHITE), `${ios}/Splash.imageset/${name}`, true);
}
console.log("assets written");
