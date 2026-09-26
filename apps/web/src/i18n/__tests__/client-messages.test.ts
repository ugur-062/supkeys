import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PANEL_NAMESPACES, SERVER_ONLY_NAMESPACES, clientMessages, omitPaths, panelMessages } from "../client-messages";

describe("clientMessages", () => {
  it("sunucuya özel ad alanlarını ayıklar, kalanına dokunmaz", () => {
    const out = clientMessages({
      common: { errors: { x: "y" } },
      web: {
        seo: { a: "b" },
        marketing: { about: { title: "H" }, nav: { login: "Giriş" }, home: { hero: "x" } },
        settings: { language: { label: "Dil" } },
      },
    });
    expect(out).toEqual({
      common: { errors: { x: "y" } },
      web: {
        seo: { a: "b" },
        marketing: { nav: { login: "Giriş" }, home: { hero: "x" } },
        settings: { language: { label: "Dil" } },
      },
    });
  });

  it("olmayan yol hata vermez, girdiyi değiştirmez", () => {
    const input = { web: { nav: { a: "b" } } };
    const out = omitPaths(input, ["web.seo.deep.path", "nope"]);
    expect(out).toEqual(input);
    expect(input.web.nav.a).toBe("b");
  });
});

/**
 * DOSYA SİSTEMİ BEKÇİSİ: "use client" bileşenleri sunucuya özel ad
 * alanlarından okuyamaz — sağlayıcıya gitmeyen anahtar çalışma zamanında
 * ham anahtar yolu olarak basılırdı.
 */
describe("istemci bileşenleri sunucuya özel ad alanı okumaz", () => {
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

  it("hiçbir 'use client' dosyası yasak ad alanı kullanmaz", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf-8");
      if (!/^\s*["']use client["']/.test(src)) continue;
      for (const ns of SERVER_ONLY_NAMESPACES) {
        if (src.includes(`"${ns}"`) || src.includes(`"${ns}.`)) offenders.push(`${path.relative(SRC, f)} → ${ns}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("web.panel yalnız panelde (i18n Faz 2)", () => {
  it("clientMessages web.panel'i ayıklar, panelMessages geri ekler", () => {
    const all = { web: { panel: { nav: { a: "b" } }, marketing: { nav: { x: "y" } }, marketing_about: {} }, common: { errors: {} } };
    const client = clientMessages(all) as { web: Record<string, unknown> };
    expect(client.web.panel).toBeUndefined();
    const panel = panelMessages(all) as { web: Record<string, unknown> };
    expect(panel.web.panel).toEqual({ nav: { a: "b" } });
    expect(panel.web.marketing).toEqual({ nav: { x: "y" } });
    expect(PANEL_NAMESPACES).toEqual(["web.panel"]);
  });

  it("herkese açık yüzeyle paylaşılan bileşenler web.panel okumaz", () => {
    const SRC = path.resolve(__dirname, "../..");
    const publicDirs = ["components/marketplace", "components/marketing", "components/home", "components/ui", "components/seo"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      if (!statSync(dir, { throwIfNoEntry: false })) return;
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) { if (entry !== "__tests__") walk(full); }
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && /Translations\("web\.panel/.test(readFileSync(full, "utf-8"))) offenders.push(path.relative(SRC, full));
      }
    };
    for (const d of publicDirs) walk(path.join(SRC, d));
    // herkese açık sayfalar: app/[locale] altında company dışı her şey
    const appDir = path.join(SRC, "app/[locale]");
    for (const entry of readdirSync(appDir)) {
      if (entry === "company") continue;
      const full = path.join(appDir, entry);
      if (statSync(full).isDirectory()) walk(full);
    }
    expect(offenders).toEqual([]);
  });
});
