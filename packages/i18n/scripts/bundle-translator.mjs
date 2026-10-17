/**
 * `dist/translator.js`i use-intl çekirdeğiyle BİRLİKTE tek CJS dosyaya paketler.
 *
 * Neden: use-intl v4 yalnız ESM dağıtıyor. API (CommonJS) Node ≥22.12'de
 * `require(esm)` ile çalışırdı ama jest'in CJS yükleyicisi ESM'i yükleyemez
 * ("Must use import to load ES Module"). Kendi içinde CJS bir çevirmen hem
 * jest'i hem de Node sürümüne bağımlılığı kaldırır. `./messages` ve `./locales`
 * dışarıda kalır (tsc çıktısı), JSON iki kez gömülmez.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/translator.ts"],
  outfile: "dist/translator.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["./messages", "./locales", "react"],
  logLevel: "warning",
});
console.log("[i18n] dist/translator.js paketlendi (use-intl/core gömülü)");
