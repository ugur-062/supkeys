import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DOSYA SİSTEMİ BEKÇİSİ (2026-09-27, uluslararası tur): `"tr-TR"` literali
 * yalnız aşağıdaki izinli dosyalarda geçer. Panelde onlarca yer sayı/para/
 * tarihi `toLocaleString("tr-TR")` ile biçimliyordu → İngilizce arayüzde
 * "12.500" (on iki bin beş yüz mü, on iki buçuk mu?), "208,2 B €" ("B"
 * İngilizcede billion), Türkçe ay adları; `toLocaleLowerCase("tr-TR")` ise
 * Latin "I"yı "ı" yapıp İngilizce/Rusça adlarda aramayı kaçırıyordu.
 *
 * Aynı bekçi `toLocaleLowerCase("tr")`/`toLocaleUpperCase("tr")`i de yasaklar
 * ("PIPE" → "pıpe": İngilizce ad Latin "i" ile aranınca bulunmuyordu).
 *
 * Doğru yol: bileşende `useFormatNumber`/`useFormatPercent`/`useFormatDate`
 * (`@/i18n/domain`), para `useFormatMoney` (`@/components/ui/money`); saf
 * kodda `formatNumber(n, locale)`/`intlLocale(locale)` (`@/i18n/format`);
 * aramada `foldSearchText` (`@rothern/shared`); baş harfte `upperForText`.
 */
/** `"tr-TR"` literali ya da `toLocaleLowerCase("tr")`/`toLocaleUpperCase("tr")`. */
const BANNED = /["']tr-TR["']|toLocale(?:Lower|Upper)Case\(\s*["']tr["']/;

const ALLOWED: Record<string, string> = {
  "i18n/format.ts": "INTL_LOCALE tablosu — dil kodu → BCP-47 tek kaynağı",
  "lib/seo/meta.ts": "LANG_TAG tablosu — JSON-LD inLanguage",
  "components/marketing/legal-doc.tsx": "sözleşme metni her dilde Türkçe (inLanguage tr-TR)",
};

describe('"tr-TR" literali yalnız izinli dosyalarda', () => {
  const SRC = path.resolve(__dirname, "../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") walk(full);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
    }
  };
  walk(SRC);

  it("tarama boşa dönmüyor", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("izinli dosyalar dışında tırnaklı \"tr-TR\" ve Türkçe büyük/küçük harf çevirimi yok", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = path.relative(SRC, f).split(path.sep).join("/");
      if (ALLOWED[rel]) continue;
      const lines = readFileSync(f, "utf-8").split("\n");
      lines.forEach((line, i) => {
        // Yorum satırları sayılmaz (kural gerekçesini anlatan açıklamalar).
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
        if (BANNED.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("izin listesi bayat değil (her izinli dosya hâlâ literali taşıyor)", () => {
    for (const rel of Object.keys(ALLOWED)) {
      const src = readFileSync(path.join(SRC, rel), "utf-8");
      expect(/["']tr-TR["']/.test(src), rel).toBe(true);
    }
  });
});
