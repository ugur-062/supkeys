/**
 * SATIŞ HERO SAHNESİ — altı ayrı katmandan TEK görsel üretir.
 *
 * Kullanıcı katmanları (depo · harita · uçak · liman · dalga · zemin) ayrı
 * PNG olarak verdi; DOM'da altı ayrı katman "köşelere yapıştırılmış" gibi
 * duruyordu (satınalma turunda öğrenildi), bu yüzden kompozisyon BURADA
 * yapılıp `public/hero/hero-scene-satis.webp` olarak yazılıyor. Sayfa tek
 * `<img>` basar.
 *
 * Kaynak PNG'ler repoda DEĞİL (kullanıcının makinesinde). Yeniden üretmek
 * gerekirse `dir` yolunu güncelleyip:
 *   node apps/web/scripts/compose-hero-satis.mjs apps/web/public/hero/hero-scene-satis.webp
 *
 * `sharp` API paketinden ödünç alınır (web'in bağımlılığı değil) — bu betik
 * build'in parçası değil, elle çalıştırılan bir üretim aracıdır.
 */
import { createRequire } from "node:module";
const require = createRequire(new URL("../../api/", import.meta.url));
const sharp = require("sharp");
const dir = "/mnt/c/Users/noahc/OneDrive/Masaüstü/foto satıs";
const F = {
  depo: `${dir}/ChatGPT Image 8 Eyl 2026 15_29_41 (1).png`,
  harita: `${dir}/ChatGPT Image 8 Eyl 2026 15_29_41 (2).png`,
  ucak: `${dir}/ChatGPT Image 8 Eyl 2026 15_29_42 (3).png`,
  liman: `${dir}/ChatGPT Image 8 Eyl 2026 15_29_42 (4).png`,
  dalga: `${dir}/ChatGPT Image 8 Eyl 2026 15_29_43 (5).png`,
  zemin: `${dir}/ChatGPT Image 8 Eyl 2026 15_29_43 (6).png`,
};
const W = 1942, H = 700;

/** Alpha kanalını `op` ile ölçekler (sharp'ta doğrudan opacity yok). */
async function fade(file, op, resize) {
  let img = sharp(file).ensureAlpha();
  if (resize) img = img.resize(resize);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * op);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Zemin ve dalga BANT ORANINA kırpılır: tam genişlikte yeniden
// boyutlandırınca yükseklik tuvali aşıyor (sharp: "composite must have same
// dimensions or smaller").
const zemin = await fade(F.zemin, 0.9, { width: W, height: 320, fit: "cover", position: "bottom" });
const harita = await fade(F.harita, 0.5, { width: 1150 });
const depo = await fade(F.depo, 0.95, { height: 560 });
const liman = await fade(F.liman, 0.95, { height: 600 });
const ucak = await fade(F.ucak, 0.9, { width: 330 });
const dalga = await fade(F.dalga, 0.5, { width: W, height: 200, fit: "cover", position: "bottom" });

const meta = async (b) => await sharp(b).metadata();
const mz = await meta(zemin), md = await meta(depo), ml = await meta(liman), mw = await meta(dalga);

await sharp({ create: { width: W, height: H, channels: 4, background: "#ffffff" } })
  .composite([
    { input: zemin, left: 0, top: H - (mz.height ?? 0) },
    { input: harita, left: Math.round((W - 1150) / 2), top: 10 },
    { input: depo, left: 0, top: H - (md.height ?? 0) },
    { input: liman, left: Math.max(0, W - (ml.width ?? 0)), top: H - (ml.height ?? 0) },
    { input: ucak, left: W - 660, top: 70 },
    { input: dalga, left: 0, top: Math.max(0, H - (mw.height ?? 0)) },
  ])
  .flatten({ background: "#ffffff" })
  .webp({ quality: 86 })
  .toFile(process.argv[2]);
console.log("ok");
