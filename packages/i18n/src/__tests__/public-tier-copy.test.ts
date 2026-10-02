import { describe, expect, it } from "vitest";
import { rawMessages, type MessageTree } from "../messages";

/**
 * Herkese açık sayfa metinleri paket kurallarıyla çelişmez (arayüz testi son
 * tur S-PUB-ADMIN). Ücretsiz hesap: davet edildiği/bağlı olduğu firmanın
 * talebine teklif. Herkese açık talebe teklif, alıcı kimliği ve bağlantı
 * daveti → Silver. Bilgi talebi (T-02) ve talep yayını → Gold. Eskiden ana
 * sayfa, /alim-talepleri, /urunler ve firma profili "ücretsiz hesapla teklif
 * ver / alıcıyı gör / bilgi talebi gönder / bağlantı kur" diyordu.
 */
const LOCALES = ["tr", "en", "ru"] as const;

const SILVER_KEYS = [
  "marketing.home.supplierLead",
  "marketing.home.supplierCtaText",
  "marketing.home.demandsLead",
  "marketing.home.seoParagraph",
  "marketplace.pages.demandsLead",
  "marketplace.pages.demandsMetaDesc",
  "marketplace.pages.gateAsideHint",
];
const GOLD_KEYS = [
  "marketing.home.seoParagraph",
  "marketplace.pages.productsLead",
  "marketplace.pages.gateAsideHint",
];
/** Talep yayını Gold — "ücretsiz yayımlayın" denmez. */
const NO_FREE_PUBLISH_KEYS = ["marketplace.pages.cityMetaDescNone", "marketplace.pages.countryMetaDescNone"];

/** Ücretsiz hesaba teklif / bilgi talebi / bağlantı vaadi kalıpları. */
const FREE_PROMISE: Record<(typeof LOCALES)[number], RegExp[]> = {
  tr: [
    /teklif vermek ücretsiz/i,
    /(teklif vermek|alıcı(yı| bilgilerini) görmek|bilgi talebi|bağlantı kurmak)[^.;]*için ücretsiz (hesap|kaydol)/i,
    /ücretsiz yayımlay/i,
  ],
  en: [
    /quoting is free/i,
    /free account (lets you|for|is needed to) [^.;]*(quote|inquir|connect|buyer)/i,
    /publish [^.;]*for free/i,
  ],
  ru: [
    /предложений бесплатна/i,
    /бесплатный аккаунт (открывает|позволяет|нужен)[^.;]*(предложени|запрос|связ|покупател)/i,
    /бесплатно опубликуйте/i,
  ],
};

function pick(loc: (typeof LOCALES)[number], path: string): string {
  const [ns, ...rest] = ["web", ...path.split(".")];
  const node = rest.reduce<MessageTree | string | undefined>(
    (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
    rawMessages(loc, ns as "web"),
  );
  expect(typeof node, `${loc}:${path}`).toBe("string");
  return node as string;
}

describe("herkese açık metinler — paket kuralları", () => {
  it.each(LOCALES)("%s: teklif/alıcı/bağlantı metinleri Silver'ı, bilgi talebi metinleri Gold'u anar", (loc) => {
    for (const k of SILVER_KEYS) expect(pick(loc, k), `${loc}:${k}`).toMatch(/Silver/);
    for (const k of GOLD_KEYS) expect(pick(loc, k), `${loc}:${k}`).toMatch(/Gold/);
  });

  it.each(LOCALES)("%s: ücretsiz hesaba teklif, bilgi talebi ya da talep yayını vaat edilmez", (loc) => {
    for (const k of [...new Set([...SILVER_KEYS, ...GOLD_KEYS, ...NO_FREE_PUBLISH_KEYS])]) {
      const v = pick(loc, k);
      for (const re of FREE_PROMISE[loc]) expect(v, `${loc}:${k}`).not.toMatch(re);
    }
  });
});
