import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "../locales";
import { rawMessages, type MessageTree } from "../messages";

/**
 * SOĞUK DAVET METNİ (2026-10-09, sahip: "AI'ın bulduğu, hiç kayıt olmamış
 * firmalara giden davet Promosyonlar'a ya da spam'e düşmemeli").
 *
 * Talep daveti, hatırlatması, özeti ve "katıl" daveti düz bir iş mektubudur:
 * olgusal ve sakin. Bu dört şablonun katalog anahtarlarında (üç dilde)
 *   - ünlem, emoji, vurgu için TAMAMI BÜYÜK sözcük,
 *   - pazarlama / aciliyet sözcüğü ("ücretsiz", "free", "бесплатно", "hemen",
 *     "fırsat", "tıklayın"…),
 *   - biçim etiketi (`<b>`, `<link>`…; mektup düz metinden çizilir)
 * bulunmaz. Konu kalıbı "<firma> sizden teklif istiyor: <kalemler>" olarak kalır.
 */
const ROOTS = ["tenderExternalInvite", "tenderInviteDigest", "referralInvite", "plain"] as const;

function strings(node: MessageTree | string, prefix: string, out: Array<[string, string]> = []) {
  if (typeof node === "string") out.push([prefix, node]);
  else for (const [k, v] of Object.entries(node)) strings(v, `${prefix}.${k}`, out);
  return out;
}

function copy(locale: Locale): Array<[string, string]> {
  const email = rawMessages(locale, "email");
  return ROOTS.flatMap((root) => {
    const node = email[root];
    if (node === undefined) throw new Error(`katalogda yok: email.${root}`);
    return strings(node, `email.${root}`);
  });
}

/** ICU argümanları ve çoğul iskeleti metin değildir (`{count, plural, one {…}}`). */
const withoutIcu = (text: string) => text.replace(/\{\s*\w+\s*(,\s*(plural|select|number)\s*,?)?/g, " ").replace(/[{}#]/g, " ");

/** Sözcük BAŞINDA aranır (ekli biçimler de yakalansın). */
const MARKETING: Record<Locale, RegExp> = {
  tr: /(^|[^\p{L}])(ücretsiz|bedava|fırsat|kampanya|indirim|hemen|acele|kaçırma|tıkla|özel teklif|garanti|kazan(?!dır))/iu,
  en: /(^|[^\p{L}])(free|offer|deal|discount|act now|right away|hurry|click here|limited time|guarantee|exclusive|winner|urgent)/iu,
  ru: /(^|[^\p{L}])(бесплатн|скидк|акци|срочно|сразу|успейте|нажмите|эксклюзив|гарант|выгодн)/iu,
};

describe("soğuk davet metni — olgusal ve sakin", () => {
  describe.each(LOCALES)("%s", (locale) => {
    const entries = copy(locale);

    it("dört şablonun anahtarları var", () => {
      expect(entries.length).toBeGreaterThan(35);
    });

    it("ünlem yok", () => {
      expect(entries.filter(([, v]) => /[!¡]/.test(v))).toEqual([]);
    });

    it("emoji yok", () => {
      expect(entries.filter(([, v]) => /\p{Extended_Pictographic}/u.test(v))).toEqual([]);
    });

    it("vurgu için tamamı büyük harfli sözcük yok", () => {
      // "B2B" rakam taşır; üç ve daha çok BÜYÜK harf yan yana gelmez.
      expect(entries.filter(([, v]) => /\p{Lu}{3,}/u.test(withoutIcu(v)))).toEqual([]);
    });

    it("pazarlama / aciliyet sözcüğü yok", () => {
      expect(entries.filter(([, v]) => MARKETING[locale].test(withoutIcu(v)))).toEqual([]);
    });

    it("biçim etiketi yok (mektup düz metinden çizilir)", () => {
      expect(entries.filter(([, v]) => /<\/?[a-z][^>]*>/i.test(v))).toEqual([]);
    });

    it("açılış cümlesi (önizleme) nokta ile biten tek olgu cümlesi", () => {
      const email = rawMessages(locale, "email") as Record<string, Record<string, string>>;
      for (const [root, key] of [
        ["tenderExternalInvite", "opening"],
        ["tenderExternalInvite", "reminderOpening"],
        ["tenderInviteDigest", "opening"],
        ["referralInvite", "opening"],
      ] as const) {
        const text = email[root]![key]!;
        expect([root, key, text.endsWith(".")]).toEqual([root, key, true]);
        expect([root, key, text.includes("Rothern")]).toEqual([root, key, true]);
      }
    });
  });

  it("konu kalıbı değişmedi (firma + kalemler; adı gizli talepte nötr ad aynı kalıba girer)", () => {
    const subject = (locale: Locale) =>
      (rawMessages(locale, "email") as Record<string, Record<string, string>>).tenderExternalInvite!.subjectItems;
    expect(subject("tr")).toBe("{inviterName} sizden teklif istiyor: {items}");
    expect(subject("en")).toBe("{inviterName} is requesting your quote: {items}");
    expect(subject("ru")).toBe("{inviterName} запрашивает у Вас предложение: {items}");
  });
});
