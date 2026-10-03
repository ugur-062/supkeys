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
  // Talep detayı ALICI kartı + "Talep bilgileri" kilit notu ve llms.txt
  // kuralı (arayüz testi kapanış webA-1): alıcı kimliği/şartname "kayıtlı
  // kullanıcılara açık" değil, Silver (davetliye ücretsiz) ile açılır.
  "marketplace.listing.identityNote",
  "marketplace.listing.membersNote",
  "marketplace.listing.gateHint",
  "marketplace.listing.gateHintClosed",
  "marketplace.listing.silverNote",
  "marketing.llms.ruleItems",
  // Arayüz testi kapanış COPY: talep kartı/kapı başlığı, kayıt CTA'sı ve
  // ödülü, bağlantı CTA'ları, firma dizini, nasıl çalışır, hakkımızda,
  // onboarding, llms, meta açıklamaları — hepsi paketi baştan söyler.
  "marketplace.listing.gateTitle",
  "marketplace.listing.signupCta",
  "marketplace.listing.perk1",
  "marketplace.card.specsMembers",
  "marketplace.card.itemsCountMembers",
  "marketplace.bidGate.body",
  "marketplace.pages.connectVerifyCta",
  "panel.company.firmaIdPage.baglantiIcinOnceDogrulanin",
  "marketplace.index.companyLead",
  "marketplace.pages.companiesMetaDesc",
  "marketing.home.metaDescription",
  "seo.siteDescription",
  "marketing.howItWorks.hero.lead",
  "marketing.howItWorks.hero.step2Body",
  "marketing.howItWorks.cta.body",
  "marketing.howItWorks.profile.requestQuote",
  "marketing.about.what2",
  "auth.onboarding.nextBody",
  "marketing.llms.surfaceCompanies",
  "marketing.trustBand.lead",
];
const GOLD_KEYS = [
  "marketing.home.seoParagraph",
  "marketplace.pages.productsLead",
  "marketplace.pages.gateAsideHint",
  "marketplace.index.companyLead",
  "marketplace.pages.companiesMetaDesc",
  "marketplace.pages.productsMetaDesc",
  "marketplace.pages.categoryLead",
  "marketplace.pages.categoryMetaDesc",
  "marketplace.pages.cityMetaDescHas",
  "marketplace.pages.countryMetaDescHas",
  "marketing.home.metaDescription",
  "seo.siteDescription",
  "marketing.howItWorks.hero.lead",
  "marketing.howItWorks.cta.body",
  "auth.onboarding.nextBody",
  "marketing.llms.surfaceCompanies",
  "marketing.flow.step2Body",
];
/**
 * Paket adı taşımayan ama doğrudan iletişim/bağlantı vaat ETMEMESİ gereken
 * dolgu metinleri (meta kuyruğu, nasıl çalışır adımı/vitrin maddesi).
 */
const NO_CONTACT_KEYS = [
  "seo.exploreTail",
  "marketing.howItWorks.hero.step2Title",
  "marketing.howItWorks.showcaseSection.b3",
  "marketing.howItWorks.profile.rfqLine",
  "marketplace.pages.categoryLead",
  "marketplace.pages.productsMetaDesc",
  "marketplace.pages.categoryMetaDesc",
  "marketplace.pages.cityMetaDescHas",
  "marketplace.pages.countryMetaDescHas",
  "marketing.home.metaDescription",
  "marketplace.index.companyLead",
];
/** Doğrudan iletişim / bilgi isteme / "firmalarla konuşun" vaadi. */
const DIRECT_CONTACT: Record<(typeof LOCALES)[number], RegExp> = {
  tr: /doğrudan (bilgi|iletişim|ulaş)|firmalarla (konuş|iletişim)|bilgi isteyin|bağlantı kur(un|up)?\b|teklif talep et/i,
  en: /directly|talk to companies|contacting companies|request information|request a quote/i,
  ru: /напрямую|общайтесь с компаниями|связь с компаниями|запросите информацию|установите контакт/i,
};
/** Talep yayını Gold — "ücretsiz yayımlayın" denmez. */
const NO_FREE_PUBLISH_KEYS = ["marketplace.pages.cityMetaDescNone", "marketplace.pages.countryMetaDescNone"];

/** Ücretsiz hesaba teklif / bilgi talebi / bağlantı vaadi kalıpları. */
const FREE_PROMISE: Record<(typeof LOCALES)[number], RegExp[]> = {
  tr: [
    /teklif vermek ücretsiz/i,
    /(teklif vermek|alıcı(yı| bilgilerini) görmek|bilgi talebi|bağlantı kurmak)[^.;]*için ücretsiz (hesap|kaydol)/i,
    /ücretsiz yayımlay/i,
    /yalnız(ca)? kayıtlı (kullanıcı|firma|üye)/i,
  ],
  en: [
    /quoting is free/i,
    /free account (lets you|for|is needed to) [^.;]*(quote|inquir|connect|buyer)/i,
    /publish [^.;]*for free/i,
    /registered (users|companies|members) only|only (to|for) registered/i,
  ],
  ru: [
    /предложений бесплатна/i,
    /бесплатный аккаунт (открывает|позволяет|нужен)[^.;]*(предложени|запрос|связ|покупател)/i,
    /бесплатно опубликуйте/i,
    /только зарегистрированн/i,
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
  it.each(LOCALES)("%s: meta/adım/dizin metinleri doğrudan iletişim ya da bilgi talebi vaat etmez", (loc) => {
    for (const k of NO_CONTACT_KEYS) expect(pick(loc, k), `${loc}:${k}`).not.toMatch(DIRECT_CONTACT[loc]);
  });

  it.each(LOCALES)("%s: ücretsiz katman teklif kuralı tek ifade — davet eden VE bağlı firmalar", (loc) => {
    // bidGate.body eskiden "yalnız bağlantı davetiyle gelen taleplere" diyordu;
    // API (`listingBidEligibility`) davetli YA DA bağlı demek.
    const body = pick(loc, "marketplace.bidGate.body");
    const re = { tr: /davet edildiğiniz ve bağlantılı/i, en: /invited you or are connected to you/i, ru: /пригласили или состоят с Вами в контактах/i }[loc];
    expect(body).toMatch(re);
    expect(pick(loc, "pricing.plans.standart.f2")).toMatch(re);
  });

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
