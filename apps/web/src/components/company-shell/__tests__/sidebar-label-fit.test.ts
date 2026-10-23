import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANY_AREA, PORTALS } from "@/lib/company/portals";

/**
 * Sol menü etiketleri genişlemiş rayda (256 px; etiket alanı 185 px) KESİLMEZ
 * (mobil denetim 2026-10, üçüncü tur: RU 1280'de "Мои запросы информации"
 * 194 px ölçüldü, "Мои запросы информа…" okunuyordu; etiket "Запросы
 * информации" oldu). jsdom yazı ölçmez: genişlik Chromium'da ölçülen Inter
 * 14 px / 500 harf genişliklerinden tahmin edilir (Kiril ≈ 9,2 · Latin küçük
 * ≈ 7,5 · büyük ≈ 10 · boşluk ≈ 3,7 px; "Мои запросы информации" → 191,
 * ölçülen 194). Yeni ya da uzayan etiket bu sınırı aşarsa kısaltılır.
 */
const LABEL_MAX_PX = 180;
const LOCALES = ["tr", "en", "ru"] as const;

function estimateWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += 3.7;
    else if (/\p{Script=Cyrillic}/u.test(ch)) w += 9.2;
    else if (/\p{Lu}/u.test(ch)) w += 10;
    else w += 7.5;
  }
  return w;
}

type Tree = { [k: string]: string | Tree };
const catalog = (locale: string): Tree =>
  JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../../../../packages/i18n/src/messages", locale, "web.json"), "utf-8"),
  ) as Tree;
const lookup = (tree: Tree, dotted: string): string | undefined => {
  let node: string | Tree | undefined = tree;
  for (const part of dotted.split(".")) node = typeof node === "object" ? node[part] : undefined;
  return typeof node === "string" ? node : undefined;
};

describe("Sol menü etiketleri rayda kesilmez", () => {
  const navKeys = [
    ...Object.values(PORTALS).flatMap((p) => p.nav.map((item) => `panel.nav.${item.label}`)),
    ...COMPANY_AREA.nav.map((item) => `panel.nav.${item.label}`),
    "panel.shell.sidebar.onaylar",
    "panel.shell.sidebar.ayarlar",
  ];

  it.each(LOCALES)("%s: her menü satırı 185 px etiket alanına sığar", (locale) => {
    const tree = catalog(locale);
    const tooWide: string[] = [];
    for (const key of new Set(navKeys)) {
      const label = lookup(tree, key);
      expect(label, `${locale} ${key}`).toBeTypeOf("string");
      if (estimateWidth(label!) > LABEL_MAX_PX) tooWide.push(`${key}: ${label} (~${Math.round(estimateWidth(label!))} px)`);
    }
    expect(tooWide).toEqual([]);
  });

  it("ölçü tahmini ölçülen değerlerle uyumlu (kesilen eski RU etiketi yakalanır)", () => {
    expect(estimateWidth("Мои запросы информации")).toBeGreaterThan(LABEL_MAX_PX);
    expect(estimateWidth("Запросы информации")).toBeLessThan(LABEL_MAX_PX);
  });
});
