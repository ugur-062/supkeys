import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SERVER_ONLY_NAMESPACES, clientMessages, omitPaths } from "../client-messages";

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
