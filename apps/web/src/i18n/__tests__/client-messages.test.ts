import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@rothern/i18n";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";
import { HIDDEN_SEGMENTS } from "@rothern/shared";
import type { AbstractIntlMessages } from "next-intl";
import { segmentTaglineKey, TAGLINE_SEGMENTS } from "@/lib/public/segment-taglines";
import {
  HIDDEN_TAGLINE_PATHS,
  PANEL_NAMESPACES,
  SERVER_ONLY_NAMESPACES,
  clientMessages,
  omitPaths,
  panelMessages,
} from "../client-messages";

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

/**
 * GİZLİ SEGMENTİN SLOGANI SAYFA KAYNAĞINA YAZILMAZ (canlı doğrulama 2026-10-09,
 * PUB-03): kataloglar her segmentin cümlesini tutar, istemciye giden sözlük
 * yalnız görünür segmentlerinkini taşır. Gerçek kataloglarla, üç dilde.
 */
describe("gizli segment sloganları istemci mesajlarına girmez", () => {
  type Taglines = Record<string, string>;
  const taglinesOf = (m: AbstractIntlMessages) =>
    ((m.web as Record<string, unknown>).marketing as Record<string, unknown>).taglines as Taglines;
  const hiddenKeys = HIDDEN_SEGMENTS.map((s) => `s${s}`);
  const visibleKeys = TAGLINE_SEGMENTS.filter((s) => !HIDDEN_SEGMENTS.includes(s)).map((s) => `s${s}`);

  it("yol listesi HIDDEN_SEGMENTS'ten türer (elle ikinci liste yok)", () => {
    expect(HIDDEN_TAGLINE_PATHS).toEqual(HIDDEN_SEGMENTS.map((s) => `web.marketing.taglines.s${s}`));
    expect(hiddenKeys.length).toBeGreaterThan(0);
    expect(visibleKeys.length).toBeGreaterThan(0);
  });

  it.each(LOCALES)("%s: katalog cümleleri tutar; clientMessages gizlileri düşürür, görünürlere ve yedeğe dokunmaz", (locale) => {
    const all = messagesFor(locale, WEB_NAMESPACES) as unknown as AbstractIntlMessages;
    const source = taglinesOf(all);
    // Girdi koşulu: katalogda gizli segmentlerin cümlesi VAR (yoksa sınama boş geçerdi).
    for (const key of hiddenKeys) expect(source[key], key).toEqual(expect.any(String));

    const client = taglinesOf(clientMessages(all));
    for (const key of hiddenKeys) expect(client[key], key).toBeUndefined();
    for (const key of [...visibleKeys, "fallback"]) expect(client[key], key).toBe(source[key]);
    expect(Object.keys(client).sort()).toEqual([...visibleKeys, "fallback"].sort());

    // Sayfa yüküne yazılan metinde gizli cümlelerin hiçbiri geçmez.
    const payload = JSON.stringify(clientMessages(all));
    for (const key of hiddenKeys) expect(payload.includes(JSON.stringify(source[key])), key).toBe(false);
    // Girdi değişmedi (katalog nesnesi paylaşılır).
    expect(taglinesOf(all)[hiddenKeys[0]!]).toBe(source[hiddenKeys[0]!]);
  });

  it("panel sağlayıcısı da gizli cümleleri taşımaz", () => {
    const all = messagesFor("tr", WEB_NAMESPACES) as unknown as AbstractIntlMessages;
    const panel = taglinesOf(panelMessages(all));
    for (const key of hiddenKeys) expect(panel[key], key).toBeUndefined();
    expect(panel.fallback).toEqual(expect.any(String));
  });

  // 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" geri
  // açıldı → cümlesi yeniden istemciye gider; 77 gizli kalır. Liste SEGMENT
  // düzeyindedir: 46'nın gizli ailesi (`4610…`) cümleyi sözlükten düşürmez,
  // yalnız o KODUN anahtarı yedeğe iner.
  it.each(LOCALES)("%s: 46'nın cümlesi istemci sözlüğünde; gizli ailesi yedek anahtarı okur", (locale) => {
    const all = messagesFor(locale, WEB_NAMESPACES) as unknown as AbstractIntlMessages;
    const client = taglinesOf(clientMessages(all));
    expect(HIDDEN_TAGLINE_PATHS).not.toContain("web.marketing.taglines.s46");
    expect(HIDDEN_TAGLINE_PATHS).toContain("web.marketing.taglines.s77");
    expect(client.s46).toBe(taglinesOf(all).s46);
    expect(client.s46).toEqual(expect.any(String));
    expect(client.s77).toBeUndefined();
    expect(segmentTaglineKey("46181500")).toBe("s46");
    expect(segmentTaglineKey("46101500")).toBe("fallback");
    expect(segmentTaglineKey("46182501")).toBe("fallback");
  });

  it("istemcinin okuyabildiği her anahtar sözlükte durur: gizli kod yedeğe düşer, görünür kod kendi anahtarına", () => {
    const client = taglinesOf(clientMessages(messagesFor("tr", WEB_NAMESPACES) as unknown as AbstractIntlMessages));
    for (const segment of TAGLINE_SEGMENTS) {
      const key = segmentTaglineKey(`${segment}000000`);
      expect(client[key], segment).toEqual(expect.any(String));
      if (HIDDEN_SEGMENTS.includes(segment)) expect(key).toBe("fallback");
    }
  });
});
