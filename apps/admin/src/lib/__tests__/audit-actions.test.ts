import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_FILTERS, ACTION_LABELS } from "../audit-actions";

/**
 * Derin denetim LU-11 (gözden geçirme): Denetim Kaydı'nda API'nin yazdığı her
 * eylemin bir etiketi ve süzgeçte bir öneki olmalı. Aksi halde satır ham
 * anahtarla görünür, o aile de süzgeçten seçilemez. Nöbetçi apps/api/src'deki
 * audit yazımlarını tarar: `action: "…"`, `action: koşul ? "…" : "…"`,
 * firma-kullanıcı yardımcısı `this.log("admin.user.…")` ve `*_ACTION = "…"`
 * sabitleri.
 */
const API_SRC = join(__dirname, "..", "..", "..", "..", "api", "src");
const FAMILY = String.raw`(?:admin|auth|company|email)\.[a-z_]+(?:\.[a-z_]+)*`;
const PATTERNS = [
  new RegExp(String.raw`action:\s*"(${FAMILY})"`, "g"),
  new RegExp(String.raw`action:\s*[\w.!=\s"]*?\?\s*"(${FAMILY})"\s*:\s*"(${FAMILY})"`, "g"),
  new RegExp(String.raw`this\.log\(\s*(?:[\w.!\s]*\?\s*)?"(${FAMILY})"(?:\s*:\s*"(${FAMILY})")?`, "g"),
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

function writtenActions(): Map<string, string> {
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

describe("audit action dictionary", () => {
  const actions = writtenActions();

  it("finds the API audit writes (scanner sanity)", () => {
    expect(actions.size).toBeGreaterThan(80);
    for (const a of [
      "admin.self.password_changed",
      "admin.user.sessions_dropped",
      "company.catalog_item.archived",
      "company.order.payment_rejected",
      "admin.announcement.email_completed",
    ]) {
      expect(actions.has(a), a).toBe(true);
    }
  });

  it("every API-written action has a label", () => {
    const missing = [...actions]
      .filter(([a]) => !(a in ACTION_LABELS))
      .map(([a, f]) => `${a} (${f})`);
    expect(missing).toEqual([]);
  });

  it("every API-written action is reachable from an action filter prefix", () => {
    const unreachable = [...actions.keys()].filter(
      (a) => !ACTION_FILTERS.some((f) => a.startsWith(f.value)),
    );
    expect(unreachable).toEqual([]);
  });

  it("filter values and labels are unique", () => {
    const values = ACTION_FILTERS.map((f) => f.value);
    const labels = ACTION_FILTERS.map((f) => f.label);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
