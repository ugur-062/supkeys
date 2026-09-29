import { renderEmail, type TenderExternalInviteData } from "@rothern/email";
import type { Locale } from "@rothern/i18n";

/**
 * Dış talep daveti e-postası (2026-09-27, kullanıcı: "kalemler hakkında bilgi
 * verilmeli ki şirkete cazip gelsin") — şablon ÜÇ DİLDE gerçekten çizilir:
 * konu emojisiz, kalem satırı "ad — miktar birim" alıcının dilinde (çoğul +
 * sayı biçimi), "+N kalem daha" çoğulu, kategori çoğulu, (GMT+3)'lü son
 * tarih, kapalı zarf + ücretsiz teklif cümlesi, herkese açık sayfa bağlantısı
 * ve alt bilgide gönderen ortamın alan adı + içinde bulunulan yıl. Yasaklı
 * alanlar (hedef fiyat, şartname…) yükte hiç yok — şablon basamaz.
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
    expect(text).toContain("free");
    expect(out.html).toContain(base.publicUrl);
    expect(out.html).toContain("redirect=%2Fcompany%2Filan%2Fl1");
    // Alt bilgi: gönderen ortamın alanı + yıl (sabit "rothern.com" / "2026" değil).
    expect(text).toContain("staging.supkeys.com platform");
    expect(text).toContain("© 2027 Rothern");
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
    expect(text).toContain("Вы получили это письмо от платформы staging.supkeys.com");
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
    expect(text).not.toContain("herkese açık sayfasını");
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
  it("işlem e-postası (çıkış bağlamı yok) alt bilgisi değişmez", async () => {
    const out = await renderEmail(referral, "tr", { siteUrl: "https://www.rothern.com" });
    expect(out.html).not.toContain("/sozlesmeler/kvkk");
  });
});

describe("hatırlatma + özet e-postası + gönderen adı (2026-09-27, Faz 0b)", () => {
  it("hatırlatma sürümü: konu ve giriş hatırlatma, içerik aynı", async () => {
    const out = await render("en", { reminder: true });
    expect(out.subject).toBe("Reminder: Acme Makina A.Ş. is waiting for your quote — Seamless pipe DN50, Flange DN50 +10 items");
    expect(visible(out.html)).toContain("is still waiting for your quote");
    expect(out.text.startsWith("Reminder:")).toBe(true);
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

  it("özet: farklı alıcılar → 'A and N other buyers', her kartın kendi bağlantısı, en fazla 3 kalem", async () => {
    const out = await renderEmail(
      {
        template: "tender_invite_digest",
        data: { invites: [entry("ABC Construction", "1"), entry("XYZ Metal", "2"), entry("XYZ Metal", "3")], optOutUrl: "https://x/opt" },
      },
      "en",
    );
    expect(out.subject).toBe("ABC Construction and 1 other buyer want your quote");
    expect(out.html).toContain("ref=tok1");
    expect(out.html).toContain("ref=tok3");
    const text = visible(out.html);
    expect(text).toContain("Bolt M6 — 500 pieces");
    expect(text).not.toContain("Gasket");
    expect(text).toContain("+1 more line item");
    expect(out.text).toContain("https://x/opt");
  });

  it("özet: tek alıcının birden çok talebi → 'X wants your quote on N requests' (Türkçe/Rusça çoğul)", async () => {
    const data = { invites: [entry("ABC", "1"), entry("ABC", "2")], optOutUrl: "https://x/opt" };
    expect((await renderEmail({ template: "tender_invite_digest", data }, "en")).subject).toBe("ABC wants your quote on 2 requests");
    expect((await renderEmail({ template: "tender_invite_digest", data }, "tr")).subject).toBe("ABC 2 talep için sizden teklif istiyor");
    expect((await renderEmail({ template: "tender_invite_digest", data }, "ru")).subject).toBe("ABC ждёт Ваших предложений по 2 заявкам");
  });
});
