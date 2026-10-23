import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mobil kabukta yeni sekme bağlantısı aynı ekranda açılır (`NativeShellBridge`,
 * mobil denetim 2026-10 g05) — ekran okuyucu notu "(yeni sekmede açılır)" orada
 * yanlış olurdu. Not `data-new-tab-hint` taşıyan öğede durmalı ki
 * `html[data-native-shell] [data-new-tab-hint]` kuralı (globals.css) onu gizlesin.
 * İşaretsiz yeni bir not eklenirse burada kırmızı.
 */
const SRC_DIR = path.resolve(__dirname, "../..");
const HINT_CALL = /\bt\(\s*["'](newTab|yeniSekmedeAcilir)["']\s*\)/g;

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectSources(full));
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

describe("yeni sekme notu mobil kabukta gizlenebilir", () => {
  it("her '(yeni sekmede açılır)' notu data-new-tab-hint taşıyan öğenin içinde", () => {
    const unmarked: string[] = [];
    let seen = 0;
    for (const file of collectSources(SRC_DIR)) {
      const src = readFileSync(file, "utf-8");
      for (const m of src.matchAll(HINT_CALL)) {
        seen += 1;
        const before = src.slice(0, m.index);
        const open = before.lastIndexOf("<span");
        const tag = open >= 0 ? before.slice(open, before.indexOf(">", open) + 1) : "";
        if (!tag.includes("data-new-tab-hint")) {
          unmarked.push(`${path.relative(SRC_DIR, file)}:${before.split("\n").length}`);
        }
      }
    }
    // Tarama gerçekten bir şey bulmalı (anahtar adı değişirse test boşa geçmesin).
    expect(seen).toBeGreaterThan(0);
    expect(unmarked).toEqual([]);
  });
});
