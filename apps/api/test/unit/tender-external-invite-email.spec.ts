import {
  renderEmail,
  SUBJECT_ITEM_NAME_MAX,
  SUBJECT_MAX_LENGTH,
  subjectName,
  truncateAtWord,
  type TenderExternalInviteData,
} from "@rothern/email";
import type { Locale } from "@rothern/i18n";

/**
 * Dış talep daveti e-postası (2026-09-27, kullanıcı: "kalemler hakkında bilgi
 * verilmeli ki şirkete cazip gelsin") — şablon ÜÇ DİLDE gerçekten çizilir:
 * konu emojisiz, kalem satırı "ad — miktar birim" alıcının dilinde (çoğul +
 * sayı biçimi), "+N kalem daha" çoğulu, kategori çoğulu, (GMT+3)'lü son
 * tarih, kapalı zarf + ücret alınmaz cümlesi, herkese açık sayfa bağlantısı
 * ve alt bilgide gönderen ortamın alan adı. Yasaklı alanlar (hedef fiyat,
 * şartname…) yükte hiç yok — şablon basamaz.
 *
 * 2026-10-09: soğuk davetler DÜZ MEKTUP (bkz. cold-invite-plain-letter.spec —
 * biçim, bağlantı sayısı, ek/görsel yasağı orada). Burada İÇERİK sınanır.
 */
const base: TenderExternalInviteData = {
  inviterName: "Acme Makina A.Ş.",
  tenderTitle: "Steel pipes for plant expansion",
  tenderNumber: "ROT-000042",
  categories: ["Pipes", "Fittings"],
  closesAt: "October 5, 2026 at 01:30 GMT+3",
  items: [
    { name: "Seamless pipe DN50", quantity: 1200, unitCode: "M", unit: "metre" },
    { name: "Flange DN50", quantity: 1, unitCode: "PCE", unit: "adet" },
    { name: "Gasket", quantity: 25, unitCode: "PCE", unit: "adet" },
    { name: "Pipe rack", quantity: 3, unitCode: "ROL", unit: "rulo" },
    { name: "Custom part", quantity: 7, unitCode: null, unit: "Stück" },
  ],
  itemCount: 12,
  deliveryPlace: "Munich, Germany",
  supplierTypes: ["MANUFACTURER", "UNKNOWN_CODE"],
  publicUrl: "https://staging.supkeys.com/en/buying-requests/rot-000042-celik-boru",
  registerUrl: "https://staging.supkeys.com/en/company/signup?ref=tok&redirect=%2Fcompany%2Filan%2Fl1",
  optOutUrl: "https://staging.supkeys.com/en/decline-invites?token=tok",
};

async function render(locale: Locale, data: Partial<TenderExternalInviteData> = {}) {
  return renderEmail(
    { template: "tender_external_invite", data: { ...base, ...data } },
    locale,
    { siteUrl: "https://staging.supkeys.com", now: new Date("2027-01-02T10:00:00Z") },
  );
}

/** HTML'i düz metne indirger (etiket + varlık) — içerik karşılaştırması için. */
function visible(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
}

describe("tender_external_invite — üç dilde zengin davet", () => {
  it("İngilizce: kalem satırları, çoğul, kategori çoğulu, teslim yeri, satış cümleleri, bağlantılar", async () => {
    const out = await render("en");
    // Konu: davet eden + ilk iki kalem + kalan sayısı (2026-09-27).
    expect(out.subject).toBe("Acme Makina A.Ş. is requesting your quote: Seamless pipe DN50, Flange DN50 +10 items");
    const text = visible(out.html);
    expect(text).toContain("Request no.: ROT-000042");
    expect(text).toContain("Categories: Pipes, Fittings");
    expect(text).toContain("Delivery location: Munich, Germany");
    expect(text).toContain("Quote deadline: October 5, 2026 at 01:30 GMT+3");
    expect(text).toContain("Supplier type sought: Manufacturer");
    expect(text).toContain("12 line items requested:");
    expect(text).toContain("Seamless pipe DN50 — 1,200 m");
    expect(text).toContain("Flange DN50 — 1 piece");
    expect(text).toContain("Gasket — 25 pieces");
    expect(text).toContain("Pipe rack — 3 rolls");
    // Katalogda olmayan birim olduğu gibi.
    expect(text).toContain("Custom part — 7 Stück");
    expect(text).toContain("+7 more line items");
    expect(text).toContain("sealed bid");
    expect(text).toContain("There is no fee for signing up or submitting a quote.");
    // Soğuk davette "free / ücretsiz / бесплатно" sözcüğü geçmez (2026-10-09).
    expect(text).not.toMatch(/\bfree\b/i);
    expect(out.html).toContain(base.publicUrl);
    expect(out.html).toContain("redirect=%2Fcompany%2Filan%2Fl1");
    // Alt bilgi: gönderen ortamın alanı (sabit "rothern.com" değil).
    expect(text).toContain("Rothern (staging.supkeys.com) sent this email on the company’s behalf.");
    // Düz metin sürümü aynı bilgileri taşır.
    expect(out.text).toContain("- Gasket — 25 pieces");
    expect(out.text).toContain("+7 more line items");
    expect(out.text).toContain(`Public page of this request: ${base.publicUrl}`);
  });

  it("Rusça: birim çoğulu (few/many), 'и ещё N позиций', kategori tekil", async () => {
    const out = await render("ru", {
      categories: ["Трубы"],
      items: [
        { name: "Труба", quantity: 3, unitCode: "ROL", unit: "rulo" },
        { name: "Фланец", quantity: 5, unitCode: "ROL", unit: "rulo" },
        { name: "Прокладка", quantity: 1200, unitCode: "PCE", unit: "adet" },
      ],
      itemCount: 8,
    });
    expect(out.subject).toBe("Acme Makina A.Ş. запрашивает у Вас предложение: Труба, Фланец и ещё 6 позиций");
    const text = visible(out.html);
    expect(text).toContain("Категория: Трубы");
    expect(text).toContain("Труба — 3 рулона");
    expect(text).toContain("Фланец — 5 рулонов");
    // Rusça binlik ayraç boşluktur (ICU dar boşluk olabilir).
    expect(text).toMatch(/Прокладка — 1\s?200 шт\./);
    expect(text).toContain("и ещё 5 позиций");
    expect(text).toContain("Запрошено 8 позиций");
    expect(text).toContain("письмо отправлено по поручению покупателя платформой Rothern (staging.supkeys.com).");
  });

  it("Türkçe: kalem sayısı, sayı biçimi, bağlantı yoksa satır çizilmez", async () => {
    const out = await render("tr", {
      categories: ["Boru"],
      closesAt: "5 Ekim 2026 01:30 GMT+3",
      items: [{ name: "Dikişsiz boru", quantity: 1200.5, unitCode: "M", unit: "metre" }],
      itemCount: 1,
      deliveryPlace: "İstanbul, Türkiye",
      publicUrl: null,
      supplierTypes: [],
    });
    expect(out.subject).toBe("Acme Makina A.Ş. sizden teklif istiyor: Dikişsiz boru");
    const text = visible(out.html);
    expect(text).toContain("Kategori: Boru");
    expect(text).toContain("Talep edilen 1 kalem:");
    expect(text).toContain("Dikişsiz boru — 1.200,5 m");
    expect(text).toContain("Teslim yeri: İstanbul, Türkiye");
    expect(text).toContain("Son teklif tarihi: 5 Ekim 2026 01:30 GMT+3");
    expect(text).toContain("kapalı zarftadır");
    expect(text).not.toContain("kalem daha");
    expect(text).not.toContain("herkese açık sayfası");
    expect(text).not.toContain("Aranan tedarikçi tipi");
  });

  it("konu satırında emoji yok (üç dil, iki soğuk davet şablonu)", async () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const locale of ["tr", "en", "ru"] as const) {
      const ext = await render(locale);
      expect(ext.subject).not.toMatch(emoji);
      const ref = await renderEmail(
        {
          template: "referral_invite",
          data: { inviterName: "Acme", email: "a@b.kz", registerUrl: "https://x/y", optOutUrl: "https://x/z" },
        },
        locale,
      );
      expect(ref.subject).not.toMatch(emoji);
      // Sabit alan adı yerine ortam; env verilmezse rothern.com.
      expect(visible(ref.html)).toContain("rothern.com");
    }
  });
});

describe("aydınlatma metni bağlantısı (yayın denetimi 2026-09-28 Bölüm 13, KVKK m. 10)", () => {
  const referral = { template: "referral_invite" as const, data: { inviterName: "Acme", email: "a@b.kz", registerUrl: "https://x/y", optOutUrl: "https://x/z" } };
  it("işlem dışı e-posta (davet) HTML ve düz metinde alıcının dilindeki aydınlatma metnine bağlanır", async () => {
    const env = { siteUrl: "https://www.rothern.com", unsubscribeUrl: "https://www.rothern.com/u?t=1" };
    const en = await renderEmail(referral, "en", env);
    expect(en.html).toContain("https://www.rothern.com/en/legal/personal-data");
    expect(en.text).toContain("https://www.rothern.com/en/legal/personal-data");
    const tr = await renderEmail(referral, "tr", env);
    expect(tr.html).toContain("https://www.rothern.com/sozlesmeler/kvkk");
    expect(visible(tr.html)).toContain("Aydınlatma Metni");
    const ru = await renderEmail(referral, "ru", { ...env, siteUrl: "https://staging.supkeys.com" });
    expect(ru.text).toContain("https://staging.supkeys.com/ru/dokumenty/personalnye-dannye");
  });
  it("soğuk davet aydınlatma bağlantısını HER ZAMAN taşır (çıkış bağlamı kurulamasa da — ilk temas)", async () => {
    const out = await renderEmail(referral, "tr", { siteUrl: "https://www.rothern.com" });
    expect(out.html).toContain('href="https://www.rothern.com/sozlesmeler/kvkk"');
    expect(out.text).toContain("Kişisel verilerin işlenmesi (Aydınlatma Metni): https://www.rothern.com/sozlesmeler/kvkk");
  });
  it("işlem e-postası (çıkış bağlamı yok) alt bilgisi değişmez", async () => {
    const out = await renderEmail(
      { template: "notification", data: { subject: "S", heading: "H", paragraphs: ["P"] } },
      "tr",
      { siteUrl: "https://www.rothern.com" },
    );
    expect(out.html).not.toContain("/sozlesmeler/kvkk");
    expect(out.text).not.toContain("/sozlesmeler/kvkk");
  });
});

describe("hatırlatma + özet e-postası + gönderen adı (2026-09-27, Faz 0b)", () => {
  it("hatırlatma sürümü: konu ve açılış cümlesi hatırlatma, içerik aynı", async () => {
    const out = await render("en", { reminder: true });
    expect(out.subject).toBe("Reminder: Acme Makina A.Ş. is waiting for your quote — Seamless pipe DN50, Flange DN50 +10 items");
    const opening =
      "Acme Makina A.Ş. is still waiting for your quote on a buying request opened on the Rothern B2B procurement platform; the deadline is approaching.";
    expect(visible(out.html)).toContain(opening);
    // Selamdan sonraki ilk paragraf = olgunun kendisi (gelen kutusu önizlemesi).
    expect(out.text.split("\n\n").slice(0, 2)).toEqual(["Hello,", opening]);
    // Davetin geri kalanı aynı.
    const first = await render("en");
    expect(out.text.split("\n\n").slice(2)).toEqual(first.text.split("\n\n").slice(2));
  });

  const entry = (inviterName: string, n: string) => ({
    inviterName,
    tenderTitle: `Request ${n}`,
    tenderNumber: `ROT-00000${n}`,
    closesAt: "October 5, 2026 at 01:30 GMT+3",
    deliveryPlace: "Munich, Germany",
    items: [
      { name: "Bolt M6", quantity: 500, unitCode: "PCE", unit: "adet" },
      { name: "Nut M6", quantity: 500, unitCode: "PCE", unit: "adet" },
      { name: "Washer", quantity: 500, unitCode: "PCE", unit: "adet" },
      { name: "Gasket", quantity: 5, unitCode: "PCE", unit: "adet" },
    ],
    itemCount: 4,
    ctaUrl: `https://staging.supkeys.com/en/company/signup?ref=tok${n}`,
  });

  it("özet: farklı alıcılar → 'A and N other buyers', talepler numaralı satırlar, TEK ana bağlantı (ilk talep), en fazla 3 kalem", async () => {
    const out = await renderEmail(
      {
        template: "tender_invite_digest",
        data: { invites: [entry("ABC Construction", "1"), entry("XYZ Metal", "2"), entry("XYZ Metal", "3")], optOutUrl: "https://x/opt" },
      },
      "en",
    );
    expect(out.subject).toBe("ABC Construction and 1 other buyer want your quote");
    // Soğuk e-postada en fazla dört bağlantı: talep başına bağlantı basılmaz.
    expect(out.html).toContain("ref=tok1");
    expect(out.html).not.toContain("ref=tok2");
    expect(out.html).not.toContain("ref=tok3");
    expect(out.text).toContain("View the first request and sign up: https://staging.supkeys.com/en/company/signup?ref=tok1");
    const text = visible(out.html);
    expect(text).toContain("You have been asked to quote on 3 buying requests on the Rothern B2B procurement platform.");
    expect(text).toContain("1. ABC Construction — Request 1");
    expect(text).toContain("2. XYZ Metal — Request 2");
    expect(text).toContain("3. XYZ Metal — Request 3");
    expect(text).toContain("Request no.: ROT-000003");
    expect(text).toContain("Bolt M6 — 500 pieces");
    expect(text).not.toContain("Gasket");
    expect(text).toContain("+1 more line item");
    expect(text).toContain("all of the requests above appear in your account as invitations");
    expect(out.text).toContain("https://x/opt");
  });

  it("özet: tek alıcının birden çok talebi → 'X wants your quote on N requests' (Türkçe/Rusça çoğul)", async () => {
    const data = { invites: [entry("ABC", "1"), entry("ABC", "2")], optOutUrl: "https://x/opt" };
    expect((await renderEmail({ template: "tender_invite_digest", data }, "en")).subject).toBe("ABC wants your quote on 2 requests");
    expect((await renderEmail({ template: "tender_invite_digest", data }, "tr")).subject).toBe("ABC 2 talep için sizden teklif istiyor");
    expect((await renderEmail({ template: "tender_invite_digest", data }, "ru")).subject).toBe("ABC ждёт Ваших предложений по 2 заявкам");
  });

  it("özet: adını gizleyen farklı alıcılar firma anahtarıyla sayılır, ilk ad görünen alıcı (derin denetim LU-09)", async () => {
    const anon = (key: string, n: string) => ({
      ...entry("An anonymous buyer", n),
      inviterKey: `anon:${key}`,
      inviterAnonymous: true,
    });
    // İki farklı anonim firma → tek firma sanılmaz.
    const twoAnon = { invites: [anon("c1", "1"), anon("c2", "2")], optOutUrl: "https://x/opt" };
    expect((await renderEmail({ template: "tender_invite_digest", data: twoAnon }, "en")).subject).toBe(
      "An anonymous buyer and 1 other buyer want your quote",
    );
    // Aynı anonim firmanın iki talebi → tek alıcı.
    const sameAnon = { invites: [anon("c1", "1"), anon("c1", "2")], optOutUrl: "https://x/opt" };
    expect((await renderEmail({ template: "tender_invite_digest", data: sameAnon }, "en")).subject).toBe(
      "An anonymous buyer wants your quote on 2 requests",
    );
    // Adı görünen + iki anonim → ilk ad görünen alıcı, "2 other buyers".
    const mixed = {
      invites: [anon("c1", "1"), { ...entry("ABC", "2"), inviterKey: "c3" }, anon("c2", "3")],
      optOutUrl: "https://x/opt",
    };
    expect((await renderEmail({ template: "tender_invite_digest", data: mixed }, "en")).subject).toBe(
      "ABC and 2 other buyers want your quote",
    );
  });
});

/**
 * SUBJECT LENGTH (round 5, AI-MAIL-1; owner: these mails must not look like
 * advertising). Two ordinary item names made a 142 (tr) / 145 (en) character
 * subject. Rule: an item name in a subject is at most 40 characters (word
 * boundary + ellipsis), the whole subject at most 110; when two names do not
 * fit, one name is used and the "+N" count grows; the body keeps full names.
 */
describe("subject length: item name <= 40, whole subject <= 110 (round 5, AI-MAIL-1)", () => {
  const len = (s: string) => [...s].length;
  const live = {
    inviterName: "QA Alıcı Sanayi A.Ş.",
    items: [
      { name: "Hidrolik silindir çift etkili Ø80/45 strok 500 mm", quantity: 4, unitCode: "PCE", unit: "adet" },
      { name: "Hidrolik dişli pompa 20 cc/dev 250 bar", quantity: 2, unitCode: "PCE", unit: "adet" },
    ],
    itemCount: 4,
  };
  const LONG_COMPANY =
    "Kuzey Marmara Ağır Sanayi Makine İmalat Taahhüt İnşaat Turizm Gıda Sanayi ve Dış Ticaret Anonim Şirketi";
  /** Fixed text of the documented pattern, per language: [invitation, reminder]. */
  const PATTERN = {
    tr: [" sizden teklif istiyor: ", " teklifinizi bekliyor — "],
    en: [" is requesting your quote: ", " is waiting for your quote — "],
    ru: [" запрашивает у Вас предложение: ", " ждёт Вашего предложения — "],
  } as const;

  it("the live case: two names do not fit -> one name cut at a word boundary, the count grows by one", async () => {
    expect((await render("tr", live)).subject).toBe(
      "QA Alıcı Sanayi A.Ş. sizden teklif istiyor: Hidrolik silindir çift etkili Ø80/45… +3 kalem",
    );
    expect((await render("en", live)).subject).toBe(
      "QA Alıcı Sanayi A.Ş. is requesting your quote: Hidrolik silindir çift etkili Ø80/45… +3 items",
    );
    expect((await render("ru", live)).subject).toBe(
      "QA Alıcı Sanayi A.Ş. запрашивает у Вас предложение: Hidrolik silindir çift etkili Ø80/45… и ещё 3 позиции",
    );
    expect((await render("tr", { ...live, reminder: true })).subject).toBe(
      "Hatırlatma: QA Alıcı Sanayi A.Ş. teklifinizi bekliyor — Hidrolik silindir çift etkili Ø80/45… +3 kalem",
    );
  });

  it("two names that fit are both kept; a name over 40 characters is cut even then", async () => {
    const out = await render("tr", {
      inviterName: "ABC",
      items: [
        { name: "Paslanmaz çelik dikişsiz boru DN50 PN16 EN 10216-5", quantity: 10, unitCode: "M", unit: "metre" },
        { name: "Flanş DN50", quantity: 4, unitCode: "PCE", unit: "adet" },
      ],
      itemCount: 2,
    });
    expect(out.subject).toBe("ABC sizden teklif istiyor: Paslanmaz çelik dikişsiz boru DN50 PN16…, Flanş DN50");
    // Two items, only one printed: the count says so.
    const twoLong = [
      { name: "Paslanmaz çelik dikişsiz boru DN50 PN16 EN 10216-5", quantity: 10, unitCode: "M", unit: "metre" },
      { name: "Paslanmaz çelik kaynak boyunlu flanş DN50", quantity: 4, unitCode: "PCE", unit: "adet" },
    ];
    const tight = await render("tr", { inviterName: "Orta Anadolu Makina A.Ş.", items: twoLong, itemCount: 2 });
    expect(tight.subject).toBe(
      "Orta Anadolu Makina A.Ş. sizden teklif istiyor: Paslanmaz çelik dikişsiz boru DN50 PN16… +1 kalem",
    );
    // A longer company name: the one name is shortened to the room left (exactly at the limit here).
    const tighter = await render("tr", {
      inviterName: "Orta Anadolu Makina Sanayi ve Ticaret A.Ş.",
      items: twoLong,
      itemCount: 2,
    });
    expect(tighter.subject).toBe(
      "Orta Anadolu Makina Sanayi ve Ticaret A.Ş. sizden teklif istiyor: Paslanmaz çelik dikişsiz boru DN50… +1 kalem",
    );
    expect(len(tighter.subject)).toBe(SUBJECT_MAX_LENGTH);
  });

  it("the body is unchanged: full item names stay in the letter", async () => {
    const out = await render("tr", live);
    expect(out.text).toContain("- Hidrolik silindir çift etkili Ø80/45 strok 500 mm — ");
    expect(out.text).toContain("- Hidrolik dişli pompa 20 cc/dev 250 bar — ");
    expect(out.text).not.toContain("Ø80/45…");
  });

  it("never over 110 characters and the pattern stays: invitation and reminder, three languages, long names and counts", async () => {
    const longItem = (n: number) => ({
      name: `Endüstriyel tip paslanmaz çelik hidrolik silindir çift etkili Ø80/45 strok ${n}00 mm`,
      quantity: n,
      unitCode: "PCE",
      unit: "adet",
    });
    const shapes: Array<Partial<TenderExternalInviteData>> = [
      live,
      { items: [longItem(1)], itemCount: 1 },
      { items: [longItem(1), longItem(2)], itemCount: 2 },
      { items: [longItem(1), longItem(2)], itemCount: 250 },
      // No space to cut at.
      { items: [{ name: "X".repeat(90), quantity: 1, unitCode: "PCE", unit: "adet" }], itemCount: 3 },
      // No items: the request title takes the place of the item summary.
      {
        items: [],
        itemCount: 0,
        tenderTitle:
          "Fabrika genişlemesi için paslanmaz çelik boru, flanş, conta ve bağlantı elemanları ile montaj hizmeti alımı (2027 birinci çeyrek)",
      },
    ];
    for (const locale of ["tr", "en", "ru"] as const) {
      for (const reminder of [false, true]) {
        for (const inviterName of ["ABC", "QA Alıcı Sanayi A.Ş.", LONG_COMPANY, "Y".repeat(150)]) {
          for (const shape of shapes) {
            const { subject } = await render(locale, { ...shape, inviterName, reminder });
            const where = `${locale} reminder=${reminder} inviter=${inviterName.slice(0, 12)} -> ${subject}`;
            expect({ where, length: len(subject) <= SUBJECT_MAX_LENGTH }).toEqual({ where, length: true });
            const fixed = PATTERN[locale][reminder ? 1 : 0];
            expect(subject).toContain(fixed);
            // The item summary follows the fixed text; no name in it is over 40 characters.
            const summary = subject.slice(subject.indexOf(fixed) + fixed.length);
            if ((shape.items ?? []).length > 0) {
              const names = summary.replace(/ (\+\d+ (kalem|items?)|и ещё \d+ позици(я|и|й))$/, "").split(", ");
              for (const name of names) expect(len(name)).toBeLessThanOrEqual(SUBJECT_ITEM_NAME_MAX);
            }
            expect(summary.length).toBeGreaterThan(0);
            // The company name is still recognisable (its beginning is printed).
            expect(subject).toContain(inviterName.slice(0, 3));
          }
        }
      }
    }
  });

  it("digest subject: a very long company name is shortened, the sentence stays (three languages, both forms)", async () => {
    const one = (inviterName: string, n: string, inviterKey?: string) => ({
      inviterName,
      tenderTitle: `Request ${n}`,
      tenderNumber: `ROT-00000${n}`,
      closesAt: null,
      items: [],
      itemCount: 0,
      ctaUrl: `https://x/${n}`,
      ...(inviterKey ? { inviterKey } : {}),
    });
    const twoBuyers = { invites: [one(LONG_COMPANY, "1", "c1"), one("XYZ Metal", "2", "c2")], optOutUrl: "https://x/opt" };
    const sameBuyer = { invites: [one(LONG_COMPANY, "1", "c1"), one(LONG_COMPANY, "2", "c1")], optOutUrl: "https://x/opt" };
    const tails = {
      tr: [" ve 1 alıcı daha sizden teklif istiyor", " 2 talep için sizden teklif istiyor"],
      en: [" and 1 other buyer want your quote", " wants your quote on 2 requests"],
      ru: [" и ещё 1 покупатель ждут Вашего предложения", " ждёт Ваших предложений по 2 заявкам"],
    } as const;
    for (const locale of ["tr", "en", "ru"] as const) {
      const a = (await renderEmail({ template: "tender_invite_digest", data: twoBuyers }, locale)).subject;
      const b = (await renderEmail({ template: "tender_invite_digest", data: sameBuyer }, locale)).subject;
      for (const [subject, tail] of [[a, tails[locale][0]], [b, tails[locale][1]]] as const) {
        expect(len(subject)).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
        expect(subject.endsWith(`…${tail}`)).toBe(true);
        expect(subject.startsWith("Kuzey Marmara Ağır Sanayi")).toBe(true);
      }
    }
  });

  it("truncateAtWord: word boundary, hanging separator dropped, long word cut inside, characters not split", () => {
    expect(truncateAtWord("M6 cıvata", SUBJECT_ITEM_NAME_MAX)).toBe("M6 cıvata");
    expect(truncateAtWord("  M6   cıvata  ", SUBJECT_ITEM_NAME_MAX)).toBe("M6 cıvata");
    expect(truncateAtWord("Hidrolik silindir çift etkili Ø80/45 strok 500 mm", SUBJECT_ITEM_NAME_MAX)).toBe(
      "Hidrolik silindir çift etkili Ø80/45…",
    );
    expect(truncateAtWord("Rulman 6204 - ZZ C3 kapaklı", 16)).toBe("Rulman 6204…");
    const word = truncateAtWord("PaslanmazçelikdikişsizborusuperuzuntekkelimeDN50PN16", SUBJECT_ITEM_NAME_MAX);
    expect(len(word)).toBe(SUBJECT_ITEM_NAME_MAX);
    expect(word.endsWith("…")).toBe(true);
    const emoji = truncateAtWord("😀".repeat(50), 10);
    expect(len(emoji)).toBe(10);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji)).toBe(false);
  });

  it("subjectName: the name a caller passes to its own subject sentence (API notification subjects)", () => {
    const sentence = (name: string) => `${name} invited you to a buying request`;
    expect(subjectName(sentence, "ABC Ltd")).toBe("ABC Ltd");
    const cut = subjectName(sentence, LONG_COMPANY);
    expect(cut.endsWith("…")).toBe(true);
    expect(LONG_COMPANY.startsWith(cut.slice(0, -1))).toBe(true);
    expect(len(sentence(cut))).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
    // As much of the name as the sentence leaves room for.
    expect(len(sentence(cut))).toBeGreaterThan(SUBJECT_MAX_LENGTH - 12);
  });
});

describe("düz metin sürümü HTML ile aynı bilgiyi taşır + aydınlatma bayrağı (derin denetim boşluk taraması GA2)", () => {
  it("dış davet düz metni: imza, ardından alt bilgi — kim/neden, TEK çıkış bağlantısı, aydınlatma (üç dil)", async () => {
    const en = (await render("en")).text;
    expect(en.endsWith(
      [
        "— Rothern",
        "",
        "--",
        "Acme Makina A.Ş. is looking for suppliers for this buying request; Rothern (staging.supkeys.com) sent this email on the company’s behalf.",
        "Turn off invitations like this: https://staging.supkeys.com/en/decline-invites?token=tok",
        "Privacy notice: https://staging.supkeys.com/en/legal/personal-data",
      ].join("\n"),
    )).toBe(true);
    const tr = (await render("tr")).text;
    expect(tr).toContain(
      "Acme Makina A.Ş. bu alım talebi için tedarikçi arıyor; bu e-postayı firma adına Rothern (staging.supkeys.com) gönderdi.\nBu tür davetleri kapatın: https://staging.supkeys.com/en/decline-invites?token=tok",
    );
    const ru = (await render("ru")).text;
    expect(ru).toContain("Acme Makina A.Ş. ищет поставщиков по этой заявке на закупку;");
    expect(ru).toContain("Отключить такие приглашения: https://staging.supkeys.com/en/decline-invites?token=tok");
    // Eski alt not ("tek seferlik", "pazarlama listesi") artık yok.
    for (const text of [en, tr, ru]) expect(text).not.toMatch(/marketing list|pazarlama listesi|маркетингов/i);
  });

  it("imzalı çıkış bağlantısı varsa (davet akışında her zaman) TEK çıkış bağlantısı odur — HTML ve düz metinde", async () => {
    const out = await renderEmail({ template: "tender_external_invite", data: base }, "en", {
      siteUrl: "https://staging.supkeys.com",
      unsubscribeUrl: "https://staging.supkeys.com/en/email-preferences?t=signed",
    });
    for (const part of [out.html, out.text]) {
      expect(part).toContain("https://staging.supkeys.com/en/email-preferences?t=signed");
      expect(part).not.toContain("decline-invites?token=tok");
    }
  });

  it("İngilizce davet: noktayla biten firma adından sonra çift nokta basılmaz", async () => {
    const out = await render("en");
    expect(visible(out.html)).not.toMatch(/A\.Ş\.\./);
    expect(visible(out.html)).toContain("your connection with Acme Makina A.Ş. is set up.");
  });

  it("özet düz metni: imza + alt bilgi", async () => {
    const out = await renderEmail(
      {
        template: "tender_invite_digest",
        data: {
          invites: [{ inviterName: "ABC", tenderTitle: "R1", tenderNumber: "ROT-1", closesAt: "x", items: [], itemCount: 0, ctaUrl: "https://x/1" }],
          optOutUrl: "https://x/opt",
        },
      },
      "en",
    );
    expect(out.text.endsWith(
      [
        "— Rothern",
        "",
        "--",
        "The companies above are looking for suppliers for their buying requests; Rothern (rothern.com) sent this email on their behalf.",
        "Turn off invitations like this: https://x/opt",
        "Privacy notice: https://www.rothern.com/en/legal/personal-data",
      ].join("\n"),
    )).toBe(true);
  });

  const notification = {
    template: "notification" as const,
    data: { subject: "S", heading: "H", paragraphs: ["P"], ctaLabel: "C", ctaUrl: "https://x/c" },
  };
  it("privacyNotice: çıkış bağlantısı OLMADAN aydınlatma satırı HTML ve düz metinde (çıkış satırı yok)", async () => {
    const out = await renderEmail(notification, "en", { siteUrl: "https://www.rothern.com", privacyNotice: true });
    expect(out.html).toContain("https://www.rothern.com/en/legal/personal-data");
    expect(out.text).toContain("Privacy notice: https://www.rothern.com/en/legal/personal-data");
    expect(out.html).not.toContain("Unsubscribe");
    expect(out.text).not.toContain("Unsubscribe");
  });
  it("bayrak yoksa işlem e-postası aydınlatma basmaz", async () => {
    const out = await renderEmail(notification, "en", { siteUrl: "https://www.rothern.com" });
    expect(out.html).not.toContain("/legal/personal-data");
    expect(out.text).not.toContain("/legal/personal-data");
  });
});
