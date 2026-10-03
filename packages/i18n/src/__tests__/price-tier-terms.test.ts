import { describe, expect, it } from "vitest";
import { rawMessages, type MessageTree } from "../messages";

/**
 * Kademeli fiyat terimi tek: Rusçada fiyat editörü "ступень" der (Ступени,
 * Добавить ступень, satır ipucu). Taslak kaydındaki "eksik kademe" bildirimi
 * "уровень" diyordu ve kullanıcı onu editördeki satırlarla eşleyemiyordu
 * (arayüz testi webC-4). Anahtar adında "kademe" geçen her metin aynı terimi
 * kullanır.
 */
const TERM: Record<"ru" | "en", { must: RegExp; mustNot?: RegExp }> = {
  ru: { must: /ступен/i, mustNot: /уров(ень|ня|ней|не)/i },
  en: { must: /tier/i, mustNot: /\blevels?\b/i },
};

function tierStrings(node: MessageTree | string, prefix: string, out: Array<[string, string]> = []) {
  if (typeof node === "string") {
    if (/kademe/i.test(prefix.split(".").pop() ?? "")) out.push([prefix, node]);
  } else for (const [k, v] of Object.entries(node)) tierStrings(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

describe("kademeli fiyat terimi — editör ve bildirimler aynı sözcüğü kullanır", () => {
  it.each(Object.keys(TERM) as Array<"ru" | "en">)("%s", (locale) => {
    const rows = tierStrings(rawMessages(locale, "web"), "");
    expect(rows.length).toBeGreaterThanOrEqual(7);
    const { must, mustNot } = TERM[locale];
    const offenders = rows.filter(([, v]) => !must.test(v) || (mustNot && mustNot.test(v)));
    expect(offenders).toEqual([]);
  });
});
