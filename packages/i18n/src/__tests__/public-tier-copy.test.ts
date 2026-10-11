import { describe, expect, it } from "vitest";
import { rawMessages, type MessageTree } from "../messages";

/**
 * ÜCRETSİZ DÖNEM METİN NÖBETÇİSİ (sahip kararı 2026-10-07).
 *
 * Rothern ilk dönemde tamamen ücretsizdir; doğrulanan firma tam yetkilidir.
 * 1) Hiçbir katalog metni (web / api / email / common; TR / EN / RU) paket adı
 *    anmaz.
 * 2) Ana sayfa "tamamen ücretsiz" der ve doğrulama ŞARTINI anmaz (şart hesap
 *    içinde ve doğrulama sayfasında söylenir).
 * 3) Doğrulanmamış hesaba gösterilen kısa cümle ve doğrulama hatırlatması
 *    "ücretsiz + yalnızca doğrulama" der.
 *
 * Eski hâli (paket kuralları: Silver/Gold her metinde anılır) ücretli dönemin
 * sözleşmesiydi; ücretliye dönüşte git geçmişinden geri alınır.
 */
const LOCALES = ["tr", "en", "ru"] as const;
type Loc = (typeof LOCALES)[number];
const NAMESPACES = ["web", "api", "email", "common"] as const;

/** Paket adları — metal anlamındaki "altın/gold" katalogda geçmez (kategori adları DB'de). */
const PLAN_NAME = /\b(gold|silver|premium)\b|gümüş paket|altın paket|серебрян|золот|премиум/i;

function walk(node: MessageTree | string, path: string, out: [string, string][]): void {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out);
}

function pick(loc: Loc, ns: (typeof NAMESPACES)[number], path: string): string {
  const node = path.split(".").reduce<MessageTree | string | undefined>(
    (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
    rawMessages(loc, ns),
  );
  expect(typeof node, `${loc}:${ns}.${path}`).toBe("string");
  return node as string;
}

const HOME_KEYS = [
  "marketing.home.supplierLead",
  "marketing.home.supplierCtaText",
  "marketing.home.buyerLead",
  "marketing.home.buyerCtaText",
  "marketing.home.demandsLead",
  "marketing.home.showcaseLead",
  "marketing.home.seoParagraph",
  "marketing.home.metaDescription",
];
const FREE: Record<Loc, RegExp> = { tr: /ücretsiz/i, en: /\bfree\b/i, ru: /бесплат/i };
/** Doğrulama ŞARTI ifadesi ("doğrulanmış alıcılar/tedarikçiler" nitelemesi şart değildir). */
const VERIFY_REQUIREMENT: Record<Loc, RegExp> = {
  tr: /firma doğrulama|doğrulamasıyla|doğrulanmanız|doğrulayın/i,
  en: /company verification|verify your company|once your company is verified/i,
  ru: /проверк\S* компании|пройдите проверку/i,
};
const ONLY_VERIFICATION: Record<Loc, RegExp> = {
  tr: /yalnızca firma doğrulamasıyla/i,
  en: /company verification is all you need/i,
  ru: /достаточно проверки компании/i,
};

describe("ücretsiz dönem metinleri", () => {
  it.each(LOCALES)("%s: hiçbir katalog metni paket adı anmaz", (loc) => {
    const hits: string[] = [];
    for (const ns of NAMESPACES) {
      const rows: [string, string][] = [];
      walk(rawMessages(loc, ns), ns, rows);
      for (const [path, value] of rows) if (PLAN_NAME.test(value)) hits.push(`${path}: ${value}`);
    }
    expect(hits).toEqual([]);
  });

  it.each(LOCALES)("%s: ana sayfa 'ücretsiz' der, doğrulama şartını anmaz", (loc) => {
    for (const k of HOME_KEYS) {
      const v = pick(loc, "web", k);
      expect(v, `${loc}:${k}`).toMatch(FREE[loc]);
      expect(v, `${loc}:${k}`).not.toMatch(VERIFY_REQUIREMENT[loc]);
    }
  });

  it.each(LOCALES)("%s: doğrulanmamış hesaba kısa cümle — ücretsiz + yalnızca doğrulama", (loc) => {
    for (const [ns, k] of [
      ["web", "panel.shell.verificationGate.unverified.body"],
      ["web", "panel.verifyNudge.body"],
      ["api", "notifications.lifecycle.verify.body"],
    ] as const) {
      const v = pick(loc, ns, k);
      expect(v, `${loc}:${k}`).toMatch(FREE[loc]);
      expect(v, `${loc}:${k}`).toMatch(ONLY_VERIFICATION[loc]);
      // Kısa ve öz: iki-üç cümleyi geçmez.
      expect(v.length, `${loc}:${k}`).toBeLessThanOrEqual(220);
    }
  });

  it.each(LOCALES)("%s: doğrulama onayı e-postası 'ücretsiz' der", (loc) => {
    expect(pick(loc, "api", "notifications.adminCompanies.dogrulamaOnaylandiGovde")).toMatch(FREE[loc]);
  });
});
