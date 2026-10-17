import {
  createEmailClient,
  PLAIN_LETTER_MAX_LINKS,
  PLAIN_LETTER_TEMPLATES,
  renderEmail,
  type EmailTemplateData,
  type RenderedEmail,
  type TenderExternalInviteData,
  type TenderInviteDigestEntry,
} from "@rothern/email";
import type { Locale } from "@rothern/i18n";
import { tApi } from "../../src/common/i18n/i18n.service";

/**
 * SOĞUK DAVET = DÜZ MEKTUP — koruma sözleşmesi (2026-10-09, sahip: "AI'ın
 * bulduğu, hiç kayıt olmamış firmalara giden davet Promosyonlar'a ya da spam'e
 * düşmemeli; bizim tarafımızdaki her nedeni kaldırın").
 *
 * Dört bağlam (talep daveti, hatırlatması, birden çok talebin özeti, düz
 * "katıl" daveti) üç dilde, EN KÖTÜ gerçekçi veriyle (10 uzun kalem, 5 talep)
 * gerçekten çizilir. Test şunlardan biri belirirse KIRILIR:
 *   - görsel (`<img>`, `cid:`, arka plan, SVG) ya da e-posta eki
 *   - beşinci bağlantı (çıkış + aydınlatma dahil en fazla dört)
 *   - kart / tablo / renkli kutu / düğme / gizli önizleme metni
 *   - kendi alan adımız dışında bir bağlantı ya da bağlantı kısaltıcı
 *   - HTML ile düz metin arasında fark
 *   - ünlem, emoji, vurgu için büyük harf
 * Yeni bir düz mektup şablonu `PLAIN_LETTER_TEMPLATES`e eklenince buraya örnek
 * veri eklemeden test geçmez (kapsama denetimi).
 */
const SITE = "https://www.rothern.com";
const HOST = "www.rothern.com";
const UNSUBSCRIBE = `${SITE}/e-posta-tercihleri?t=ornek_jeton_1-ornek_jeton_1-son`;
/** Gönderim servisinin davet akışında kurduğu ortam (imzalı çıkış + aydınlatma). */
const SEND_ENV = { siteUrl: SITE, unsubscribeUrl: UNSUBSCRIBE, privacyNotice: true };

const LOCALES: Locale[] = ["tr", "en", "ru"];

/** Beyaz listenin tamamı dolu, kalemler uzun: en kötü durum. */
const invite: TenderExternalInviteData = {
  inviterName: "Demirtaş Endüstriyel Makina Sanayi ve Ticaret A.Ş.",
  tenderTitle: "Fabrika genişlemesi için dikişsiz çelik boru ve bağlantı elemanları alımı",
  tenderNumber: "ROT-000042",
  categories: ["Çelik borular", "Flanşlar ve bağlantı elemanları", "Contalar"],
  closesAt: "5 Ekim 2026 01:30 GMT+3",
  items: Array.from({ length: 10 }, (_, i) => ({
    name: `Dikişsiz çelik boru, sıcak çekme, kalın etli, ${i + 1}. kalem için uzun açıklamalı ad`,
    quantity: 1200 + i,
    unitCode: i % 2 === 0 ? "M" : "PCE",
    unit: "metre",
  })),
  itemCount: 37,
  deliveryPlace: "Gebze, Türkiye",
  supplierTypes: ["MANUFACTURER", "DISTRIBUTOR"],
  publicUrl: `${SITE}/alim-talepleri/rot-000042-celik-boru`,
  registerUrl: `${SITE}/company/kayit?ref=ornek_jeton_2-ornek_jeton_2-son&redirect=%2Fcompany%2Filan%2Fcmf9listing0001`,
  previewUrl: `${SITE}/talep-davet?ref=ornek_jeton_2-ornek_jeton_2-son&l=cmf9listing0001`,
  optOutUrl: `${SITE}/davet-kapat?token=ornek_jeton_2-ornek_jeton_2-son`,
};

const digestEntry = (n: number): TenderInviteDigestEntry => ({
  inviterName: `Alıcı Firma ${n} Sanayi ve Ticaret Ltd. Şti.`,
  inviterKey: `c${n}`,
  tenderTitle: `Uzun başlıklı ${n}. alım talebi: paslanmaz bağlantı elemanları ve sarf malzemeleri`,
  tenderNumber: `ROT-00010${n}`,
  closesAt: "5 Ekim 2026 01:30 GMT+3",
  deliveryPlace: "İzmir, Türkiye",
  items: invite.items!.slice(0, 4),
  itemCount: 12,
  ctaUrl: `${SITE}/talep-davet?ref=tok_digest_${n}_0123456789abcdef&l=cmf9listing000${n}`,
});

/** Bağlam → şablon verisi + beklenen bağlantılar (sırayla, gövde önce). */
const CONTEXTS: Record<string, { spec: EmailTemplateData; links: string[]; inviter: string | null }> = {
  "talep daveti": {
    spec: { template: "tender_external_invite", data: invite },
    links: [invite.registerUrl, invite.previewUrl!],
    inviter: invite.inviterName,
  },
  "talep daveti hatırlatması": {
    spec: { template: "tender_external_invite", data: { ...invite, reminder: true } },
    links: [invite.registerUrl, invite.previewUrl!],
    inviter: invite.inviterName,
  },
  "talep daveti (önizleme yok, vitrinde)": {
    spec: { template: "tender_external_invite", data: { ...invite, previewUrl: null } },
    links: [invite.registerUrl, invite.publicUrl!],
    inviter: invite.inviterName,
  },
  "talep özeti (5 talep)": {
    spec: {
      template: "tender_invite_digest",
      data: { invites: [1, 2, 3, 4, 5].map(digestEntry), optOutUrl: invite.optOutUrl },
    },
    // Talep başına bağlantı YOK: yalnız ilk talebin önizlemesi.
    links: [digestEntry(1).ctaUrl],
    inviter: null,
  },
  "katıl daveti": {
    spec: {
      template: "referral_invite",
      data: {
        inviterName: invite.inviterName,
        email: "satinalma@tedarikci-firma.com.tr",
        registerUrl: `${SITE}/company/kayit?ref=ornek_jeton_2-ornek_jeton_2-son`,
        optOutUrl: invite.optOutUrl,
      },
    },
    links: [`${SITE}/company/kayit?ref=ornek_jeton_2-ornek_jeton_2-son`],
    inviter: invite.inviterName,
  },
};

const CASES = Object.entries(CONTEXTS).flatMap(([name, c]) => LOCALES.map((locale) => [name, locale, c] as const));

const decode = (s: string) =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

/** HTML'deki bağlantı adresleri (sırayla). */
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => decode(m[1]!));
/** Düz metindeki adresler (sırayla). */
const textUrls = (text: string) => text.match(/https?:\/\/\S+/g) ?? [];

/**
 * HTML gövdesini düz metne çevirir — düz metin parçasının KURALIYLA: paragraf
 * arası boş satır, `<br/>` satır sonu, bağlantı `etiket: adres`.
 */
function htmlAsText(html: string): string {
  const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? "";
  return decode(
    bodyHtml
      .replace(/<a href="([^"]*)">([^<]*)<\/a>/g, "$2: $1")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<\/p>/g, "\n\n")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

const SHORTENERS = /\b(bit\.ly|t\.co|goo\.gl|tinyurl\.com|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|lnkd\.in|t\.ly|rb\.gy|shorturl\.at)\b/i;
/** Görünmeyen karakterler (önizleme dolgusu vb.). */
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤﻿]/;
const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * En kötü durumda bile küçük kalmalı (Gmail 102 KB'de keser; marka kabuğu tek
 * kalemli davette ~13 KB idi). Ölçüm: 10 uzun kalemli davet ~3,6 KB (RU 4,4),
 * 5 talepli özet ~4,8 KB (RU 5,8 — Kiril harfi 2 bayt).
 */
const MAX_HTML_BYTES = 8 * 1024;
/** HTML'in düz metne göre fazlası (başlık + paragraf etiketleri) — biçimlendirme eklenirse büyür. */
const MAX_MARKUP_OVERHEAD_BYTES = 1536;

describe("soğuk davet = düz mektup (koruma)", () => {
  it("her düz mektup şablonunun burada örnek verisi var", () => {
    const covered = new Set(Object.values(CONTEXTS).map((c) => c.spec.template));
    expect([...covered].sort()).toEqual([...PLAIN_LETTER_TEMPLATES].sort());
    expect(PLAIN_LETTER_MAX_LINKS).toBe(4);
  });

  describe.each(CASES)("%s — %s", (_name, locale, ctx) => {
    let out: RenderedEmail;
    beforeAll(async () => {
      out = await renderEmail(ctx.spec, locale, SEND_ENV);
    });

    it("görsel, gömülü kaynak ve izleme pikseli yok", () => {
      expect(out.html).not.toMatch(/<(img|picture|svg|video|audio|object|embed|iframe|link|script|style|font)\b/i);
      expect(out.html).not.toMatch(/cid:|data:image|url\(|\bbackground\b|\bsrc=/i);
    });

    it("kart, tablo, renkli kutu, düğme yok: yalnız paragraf, satır sonu ve düz bağlantı", () => {
      const bodyHtml = out.html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
      const tags = new Set([...bodyHtml.matchAll(/<([a-z0-9]+)\b/gi)].map((m) => m[1]!.toLowerCase()));
      expect([...tags].sort()).toEqual(["a", "br", "div", "p"]);
      // Renk, zemin, kenarlık, köşe, sınıf yok — istemcinin kendi renkleri (koyu mod dahil).
      expect(out.html).not.toMatch(/color\s*:|background|border|radius|class=|bgcolor|role="button"/i);
      // Bağlantının `href` dışında hiçbir özniteliği yok (düğme gibi biçimlenemez).
      const anchors = out.html.match(/<a\b[^>]*>/g) ?? [];
      for (const a of anchors) expect(a).toMatch(/^<a href="[^"]+">$/);
    });

    it("gizli metin yok: önizleme dolgusu, görünmez karakter, HTML yorumu", () => {
      expect(out.html).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|font-size\s*:\s*0|max-height\s*:\s*0|mso-hide/i);
      expect(out.html).not.toContain("<!--");
      expect(out.html).not.toMatch(INVISIBLE);
      expect(out.text).not.toMatch(INVISIBLE);
    });

    it(`bağlantılar: en fazla ${PLAIN_LETTER_MAX_LINKS} (çıkış + aydınlatma dahil), hepsi kendi alan adımızda, kısaltıcı yok`, () => {
      const links = hrefs(out.html);
      expect(links.length).toBeLessThanOrEqual(PLAIN_LETTER_MAX_LINKS);
      // Gövde bağlantıları + TEK çıkış + aydınlatma — fazlası da eksiği de yok.
      expect(links.slice(0, -2)).toEqual(ctx.links);
      expect(links.at(-2)).toBe(UNSUBSCRIBE);
      expect(links.at(-1)).toMatch(/^https:\/\/www\.rothern\.com\/(sozlesmeler\/kvkk|en\/legal\/personal-data|ru\/dokumenty\/personalnye-dannye)$/);
      for (const link of links) {
        const url = new URL(link);
        expect(url.protocol).toBe("https:");
        expect(url.host).toBe(HOST);
        expect(link).not.toMatch(SHORTENERS);
      }
      // Davetin kendi çıkış bağlantısı ayrıca basılmaz (iki "kapat" bağlantısı olmasın).
      expect(out.html).not.toContain("davet-kapat");
      // Düz metin AYNI bağlantıları aynı sırayla taşır.
      expect(textUrls(out.text)).toEqual(links);
    });

    it("düz metin parçası var ve HTML ile aynı şeyi söyler", () => {
      expect(out.text.trim().length).toBeGreaterThan(200);
      expect(htmlAsText(out.html)).toBe(out.text);
    });

    it("HTML küçük", () => {
      const htmlBytes = Buffer.byteLength(out.html, "utf8");
      expect(htmlBytes).toBeLessThan(MAX_HTML_BYTES);
      // İşaretleme yükü küçük: HTML, düz metinden en fazla ~1,5 KB büyük.
      expect(htmlBytes - Buffer.byteLength(out.text, "utf8")).toBeLessThan(MAX_MARKUP_OVERHEAD_BYTES);
    });

    it("selamdan sonraki ilk cümle olgunun kendisi (gelen kutusu önizlemesi); alt bilgi kim-neden + çıkış + aydınlatma", () => {
      const paragraphs = out.text.split("\n\n");
      const spec = ctx.spec;
      const opening =
        spec.template === "tender_external_invite"
          ? tApi(
              spec.data.reminder ? "email.tenderExternalInvite.reminderOpening" : "email.tenderExternalInvite.opening",
              { inviterName: ctx.inviter! },
              locale,
            )
          : spec.template === "tender_invite_digest"
            ? tApi("email.tenderInviteDigest.opening", { count: spec.data.invites.length }, locale)
            : tApi("email.referralInvite.opening", { inviterName: ctx.inviter! }, locale);
      expect(paragraphs[1]).toBe(opening);
      expect(paragraphs[0]!.length).toBeLessThan(20); // yalnız selam
      const footer = paragraphs.at(-1)!.split("\n");
      expect(footer).toHaveLength(4);
      expect(footer[0]).toBe("--");
      expect(footer[1]).toContain("Rothern (rothern.com)");
      expect(footer[2]).toBe(`${tApi("email.plain.optOut", undefined, locale)}: ${UNSUBSCRIBE}`);
      expect(footer[3]!.startsWith(`${tApi("email.plain.privacy", undefined, locale)}: https://`)).toBe(true);
      expect(paragraphs.at(-2)).toBe("— Rothern");
    });

    it("metin sakin: ünlem, emoji, vurgu için büyük harf yok (konu dahil)", () => {
      for (const part of [out.subject, out.text]) {
        expect(part).not.toContain("!");
        expect(part).not.toMatch(EMOJI);
        // Dört ve daha çok harfli TAMAMI BÜYÜK sözcük (veri: "ROT", "GMT", "A.Ş." üç harfi geçmez).
        expect(part.match(/\p{Lu}{4,}/gu) ?? []).toEqual([]);
      }
    });
  });

  /**
   * İkinci gözden geçirme B-1: düz mektubun sütunu uzun, bölünemeyen sözcüğü
   * sarmıyordu. "Katıl" mektubu alıcının KENDİ adresini basar; talep başlığı ve
   * kalem adı kullanıcı metnidir. Ölçüm (başsız Chromium, 320 / 375 px):
   * `purchasing.department@internationalsteelworks.com.tr` ile mektup 441 px,
   * 63 karakterlik tek parça başlıkla ~500 px genişliyordu (yatay kaydırma ya da
   * mektubun tamamı küçültülür); aynı metinle üye bildirimi 320 px'te kalıyor,
   * çünkü marka kabuğunun kartı sözcüğü bölebiliyor (`layout.tsx` `cardCell`).
   * Sütun aynı iki özelliği taşımalı. Jest yerleşimi ölçemez: özelliklerin
   * çizilen HTML'de sütunun kendisinde durduğu sabitlenir.
   */
  describe("uzun, bölünemeyen sözcük dar ekranda mektubu taşırmaz (B-1)", () => {
    const LONG_ADDRESS = "purchasing.department@internationalsteelworks.com.tr";
    // Tire YOK: tarayıcı tireden sonra satır kırabilir (ölçüldü: tireli başlık taşmıyor).
    const LONG_TITLE = "Paslanmaz_celik_dikissiz_boru_ve_baglanti_elemanlari_2026_alimi";
    const longToken: Record<string, { spec: EmailTemplateData; token: string }> = {
      "katıl daveti (alıcının uzun adresi)": {
        spec: {
          template: "referral_invite",
          data: {
            inviterName: invite.inviterName,
            email: LONG_ADDRESS,
            registerUrl: `${SITE}/company/kayit?ref=ornek_jeton_2-ornek_jeton_2-son`,
            optOutUrl: invite.optOutUrl,
          },
        },
        token: LONG_ADDRESS,
      },
      "talep daveti (tek parça uzun başlık)": {
        spec: { template: "tender_external_invite", data: { ...invite, tenderTitle: LONG_TITLE } },
        token: LONG_TITLE,
      },
      "talep özeti (tek parça uzun başlık)": {
        spec: {
          template: "tender_invite_digest",
          data: { invites: [{ ...digestEntry(1), tenderTitle: LONG_TITLE }, digestEntry(2)], optOutUrl: invite.optOutUrl },
        },
        token: LONG_TITLE,
      },
    };

    it("örnek sözcükler gerçekten bölünemez ve dar ekrandan uzun", () => {
      expect(LONG_TITLE).toHaveLength(63);
      // Boşluk ve tire yok (adresteki nokta / @ işaretinde tarayıcı satır kırmaz).
      for (const { token } of Object.values(longToken)) expect(token).not.toMatch(/[\s-]/);
    });

    it.each(Object.entries(longToken).flatMap(([name, c]) => LOCALES.map((locale) => [name, locale, c] as const)))(
      "%s — %s: sütun sözcüğü bölebilir; metne görünmez bölme karakteri eklenmez",
      async (_name, locale, c) => {
        const out = await renderEmail(c.spec, locale, SEND_ENV);
        // Sözcük mektupta aynen duruyor (yumuşak tire / sıfır genişlikli boşlukla bölünmedi).
        expect(out.text).toContain(c.token);
        expect(decode(out.html)).toContain(c.token);
        expect(out.html).not.toMatch(INVISIBLE);
        // Gövdedeki TEK kapsayıcı sütundur ve iki sarma özelliğini de taşır.
        const bodyHtml = out.html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
        const divs = bodyHtml.match(/<div\b[^>]*>/g) ?? [];
        expect(divs).toHaveLength(1);
        const style = (divs[0]!.match(/style="([^"]*)"/)?.[1] ?? "").replace(/\s+/g, "");
        expect(style).toContain("max-width:600px");
        expect(style).toContain("overflow-wrap:break-word");
        expect(style).toContain("word-break:break-word");
        // Koruma kuralları aynen: renk / kutu bildirimi eklenmedi.
        expect(out.html).not.toMatch(/color\s*:|background|border|radius|class=|bgcolor/i);
      },
    );
  });

  it("beyaz liste: talep davetinin gövdesi yalnız izinli olguları taşır (10 kalem + kalan sayısı)", async () => {
    const out = await renderEmail(CONTEXTS["talep daveti"]!.spec, "tr", SEND_ENV);
    // Subject length rule (round 5, AI-MAIL-1): the two long item names do not
    // fit in 110 characters (the full subject was 215) -> one name, shortened
    // to the room this long company name leaves, and the count grows by one.
    // The body below still carries every name in full.
    expect(out.subject).toBe(`${invite.inviterName} sizden teklif istiyor: Dikişsiz çelik boru… +36 kalem`);
    expect([...out.subject].length).toBeLessThanOrEqual(110);
    const lines = out.text.split("\n");
    expect(lines).toEqual(
      expect.arrayContaining([
        `Talep: ${invite.tenderTitle}`,
        "Talep no: ROT-000042",
        "Kategoriler: Çelik borular, Flanşlar ve bağlantı elemanları, Contalar",
        "Teslim yeri: Gebze, Türkiye",
        "Son teklif tarihi: 5 Ekim 2026 01:30 GMT+3",
        "Aranan tedarikçi tipi: Üretici, Distribütör / Bayi",
        "Talep edilen 37 kalem:",
        "+27 kalem daha",
      ]),
    );
    expect(lines.filter((l) => l.startsWith("- "))).toHaveLength(10);
    expect(lines).toContain(`- ${invite.items![9]!.name} — 1.209 adet`);
  });

  it("çıkış bağlamı kurulamazsa (JWT_SECRET yok) davetin kendi çıkış bağlantısı basılır — yine tek bağlantı", async () => {
    for (const ctx of Object.values(CONTEXTS)) {
      const out = await renderEmail(ctx.spec, "en", { siteUrl: SITE });
      const links = hrefs(out.html);
      expect(links.length).toBeLessThanOrEqual(PLAIN_LETTER_MAX_LINKS);
      expect(links.filter((l) => l === invite.optOutUrl)).toHaveLength(1);
      expect(textUrls(out.text)).toEqual(links);
    }
  });
});

describe("sağlayıcıya giden istek: düz mektupta EK YOK, marka kabuğunda logo eki aynen", () => {
  function client() {
    const c = createEmailClient({
      provider: "resend",
      from: { email: "hesap@rothern.com", name: "Rothern" },
      replyTo: "destek@rothern.com",
      resend: { apiKey: "re_test_key" },
    });
    const send = jest.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null });
    (c.provider as unknown as { client: unknown }).client = { emails: { send } };
    return { c, send };
  }

  it.each(Object.entries(CONTEXTS))("%s: ek anahtarı hiç gitmez", async (_name, ctx) => {
    const { c, send } = client();
    const rendered = await renderEmail(ctx.spec, "tr", SEND_ENV);
    await c.send({ to: { email: "satinalma@tedarikci-firma.com.tr" }, rendered });
    const payload = send.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("attachments");
    expect(Object.keys(payload).sort()).toEqual(["from", "html", "replyTo", "subject", "text", "to"]);
    expect(payload.text).toBe(rendered.text);
    expect(payload.replyTo).toBe("destek@rothern.com");
  });

  it("üyeye giden bildirim ve kod e-postası DEĞİŞMEDİ: marka kabuğu + iki gömülü logo", async () => {
    const { c, send } = client();
    const specs: EmailTemplateData[] = [
      { template: "notification", data: { subject: "S", heading: "Teklifiniz kazandı", paragraphs: ["Merhaba,"] } },
      { template: "notification", data: { subject: "S", heading: "Kod", paragraphs: ["Merhaba,"], code: { value: "488189" } } },
      { template: "password_reset", data: { firstName: "Ali", email: "ali@firma.com", resetUrl: `${SITE}/r?t=x`, expiresInMinutes: 30 } },
    ];
    for (const spec of specs) {
      expect(PLAIN_LETTER_TEMPLATES.has(spec.template)).toBe(false);
      const rendered = await renderEmail(spec, "tr", { siteUrl: SITE });
      expect(rendered.html).toContain('class="r-card"');
      expect(rendered.html).toContain('src="cid:rothern-logo"');
      await c.send({ to: { email: "ali@firma.com" }, rendered });
    }
    for (const call of send.mock.calls) {
      const attachments = (call[0] as { attachments: Array<{ inlineContentId: string }> }).attachments;
      expect(attachments.map((a) => a.inlineContentId)).toEqual(["rothern-logo", "rothern-logo-dark"]);
    }
  });
});
