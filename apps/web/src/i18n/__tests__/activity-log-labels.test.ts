import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Arayüz testi O-107: Ayarlar › Aktivite Logu'nda API'nin yazdığı firma
 * eylemlerinin bir kısmı "Diğer işlem" görünüyor, Detay sütunu ham alan
 * adlarını ("postalCode") basıyordu. Nöbetçi apps/api/src'yi tarar:
 * - her `company.*` audit eyleminin `web.domain.auditAction` kataloğunda
 *   etiketi olmalı (anahtar: noktalar alt çizgiye);
 * - `changedFields` üreten yazımların alan adlarının
 *   `ayarlarAktivitePage.field.<ad>` etiketi olmalı.
 * Kalıplar admin `audit-actions.test` ile aynı (action: "…", koşullu, *_ACTION).
 */
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const API_SRC = join(ROOT, "apps", "api", "src");
const FAMILY = String.raw`company\.[a-z_]+(?:\.[a-z_]+)*`;
const PATTERNS = [
  new RegExp(String.raw`action:\s*"(${FAMILY})"`, "g"),
  new RegExp(String.raw`action:\s*[\w.!=\s"]*?\?\s*"(${FAMILY})"\s*:\s*"(${FAMILY})"`, "g"),
  new RegExp(String.raw`[A-Z_]+_ACTION\s*=\s*"(${FAMILY})"`, "g"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function writtenCompanyActions(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of walk(API_SRC)) {
    const text = readFileSync(file, "utf8");
    for (const re of PATTERNS) {
      for (const m of text.matchAll(re)) {
        for (const a of m.slice(1)) {
          if (a && !found.has(a)) found.set(a, relative(API_SRC, file));
        }
      }
    }
  }
  return found;
}

/** `changedFields` yazan servislerin alan adları (değer değil, ad). */
function changedFieldNames(): Set<string> {
  const names = new Set<string>();
  const read = (rel: string) => readFileSync(join(API_SRC, rel), "utf8");
  // Firma profili: `data.<alan> = …` atamaları → changedFields = Object.keys(data).
  for (const m of read("modules/company-profile/company-profile.service.ts").matchAll(
    /\bdata\.([a-zA-Z]+)\s*=/g,
  )) {
    names.add(m[1]);
  }
  // Adres / banka hesabı: `([ "a", "b" ] as const).filter((k) => before[k] !== updated[k])`.
  for (const rel of [
    "modules/company-addresses/company-addresses.service.ts",
    "modules/company-bank-accounts/company-bank-accounts.service.ts",
  ]) {
    const text = read(rel);
    const block = /const changedFields = \(\s*\[([\s\S]*?)\]\s*as const/.exec(text);
    expect(block, rel).not.toBeNull();
    for (const m of block![1].matchAll(/"([a-zA-Z]+)"/g)) names.add(m[1]);
  }
  // Talep şartları: RequestDefaults anahtarları.
  const rd = readFileSync(
    join(ROOT, "packages", "shared", "src", "types", "request-defaults.ts"),
    "utf8",
  );
  const iface = /export interface RequestDefaults \{([\s\S]*?)\n\}/.exec(rd);
  expect(iface).not.toBeNull();
  for (const m of iface![1].matchAll(/^\s*([a-zA-Z]+)\??:/gm)) names.add(m[1]);
  return names;
}

const tr = JSON.parse(
  readFileSync(join(ROOT, "packages", "i18n", "src", "messages", "tr", "web.json"), "utf8"),
) as {
  domain: { auditAction: Record<string, string> };
  panel: { settings: { ayarlarAktivitePage: { field: Record<string, string>; reason: Record<string, string> } } };
};

describe("Aktivite Logu etiketleri (arayüz testi O-107)", () => {
  const actions = writtenCompanyActions();

  it("tarayıcı API audit yazımlarını buluyor (sağlık)", () => {
    expect(actions.size).toBeGreaterThan(60);
    for (const a of ["company.user.invited", "company.user.invitation_accepted", "company.profile.updated"]) {
      expect(actions.has(a), a).toBe(true);
    }
  });

  it("API'nin yazdığı her firma eyleminin etiketi var — 'Diğer işlem' düşmez", () => {
    const missing = [...actions]
      .filter(([a]) => !(a.replace(/\./g, "_") in tr.domain.auditAction))
      .map(([a, f]) => `${a} (${f})`);
    expect(missing).toEqual([]);
  });

  it("changedFields alan adlarının hepsinin etiketi var — ham ad basılmaz", () => {
    const fields = changedFieldNames();
    expect(fields.size).toBeGreaterThan(30);
    expect(fields.has("postalCode")).toBe(true);
    const missing = [...fields].filter((f) => !(f in tr.panel.settings.ayarlarAktivitePage.field));
    expect(missing).toEqual([]);
  });

  it("koltuk seçimi sebep kodu çevrilir", () => {
    expect(tr.panel.settings.ayarlarAktivitePage.reason.seat_selection).toBeTruthy();
  });
});
