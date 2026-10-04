import { renderEmail, splitSentences, type EmailTemplateData } from "@rothern/email";
import type { Locale } from "@rothern/i18n";
import { tApi } from "../../src/common/i18n/i18n.service";

/**
 * E-posta tasarımı (2026-10-04, kullanıcı: "çok kötü gözüküyor; Rothern logosu
 * arka temayla aynı renk bile değil — dikdörtgen bir çerçeve gibi
 * gözüküyor"). Sözleşme:
 *  - logo gri sayfa zemininde değil, beyaz kartın İÇİNDE (görselin beyaz
 *    zemini kartla aynı renk → açık modda çerçeve görünmez);
 *  - kodlu e-postada kod paragrafa gömülü değil, ayrı kod bloğunda; geçerlilik
 *    satırı ve "siz istemediyseniz" notu alıcının dilinde; kod önizleme
 *    metninde ve düz metinde de var (düz metinde bir kez);
 *  - logo dışında görsel, uzak font, SVG yok.
 */
const env = { siteUrl: "https://www.rothern.com", now: new Date("2026-10-04T09:00:00Z") };

function codeSpec(over: Record<string, unknown> = {}): EmailTemplateData {
  return {
    template: "notification",
    data: {
      subject: "E-posta doğrulama kodunuz",
      heading: "E-posta adresinizi doğrulayın",
      paragraphs: ["Merhaba,", "Rothern hesabınızı etkinleştirmek için aşağıdaki doğrulama kodunu girin."],
      code: { value: "488189", expiresInMinutes: 15 },
      ...over,
    },
  } as EmailTemplateData;
}

/** HTML'in görünen metni (Preview gizli bloğu dahil). */
function visible(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

describe("e-posta tasarımı — kabuk", () => {
  it("logo kartın içinde, alt metinli, 137×36; iki logo (açık + gizli koyu), başka görsel/uzak kaynak/SVG yok", async () => {
    const { html } = await renderEmail(codeSpec(), "tr", env);
    const card = html.indexOf('class="r-card"');
    const logo = html.indexOf('src="cid:rothern-logo"');
    expect(card).toBeGreaterThan(-1);
    expect(logo).toBeGreaterThan(card);
    const logoTag = html.match(/<img[^>]*src="cid:rothern-logo"[^>]*>/)?.[0] ?? "";
    expect(logoTag).toContain('alt="Rothern"');
    expect(logoTag).toContain('width="137"');
    expect(logoTag).toContain('height="36"');
    expect(logoTag).toContain('class="r-logo-l"');
    // İkinci tur (inceleme: "koyu modda logo yine beyaz dikdörtgen"): şeffaf
    // zeminli koyu logo VARSAYILAN GİZLİ; yalnız prefers-color-scheme: dark ve
    // Outlook.com koyu modu ([data-ogsc]) açar, açığı gizler.
    const darkWrap = html.match(/<div class="r-logo-d" style="([^"]*)">\s*<img[^>]*src="cid:rothern-logo-dark"[^>]*>/);
    expect(darkWrap).not.toBeNull();
    expect(darkWrap![1]).toContain("display:none");
    expect(darkWrap![1]).toContain("mso-hide:all");
    expect(darkWrap![1]).toContain("max-height:0");
    expect(html).toMatch(/prefers-color-scheme: dark\)[\s\S]*\.r-logo-l \{ display: none !important; \}[\s\S]*\.r-logo-d \{ display: block !important;/);
    expect(html).toContain("[data-ogsc] .r-logo-l { display: none !important; }");
    const imgs = (html.match(/<img[^>]*src="([^"]+)"/g) ?? []).map((t) => t.match(/src="([^"]+)"/)![1]);
    expect(imgs).toEqual(["cid:rothern-logo", "cid:rothern-logo-dark"]);
    // Chip metin sütunuyla aynı hizada: logo hücresinin sol dolgusu = içerik dolgusu.
    expect(html).toMatch(/class="r-pad-logo" style="padding:28px 36px 0 36px"/);
    expect(html).not.toMatch(/<svg|<link[^>]+stylesheet|@import|fonts\.googleapis/i);
    expect(html).toMatch(/<html[^>]*lang="tr"/);
    expect(html).toContain("max-width:600px");
  });

  it("işlem e-postası çıkış bağlantısı taşımaz; bildirimde çıkış + aydınlatma alt bilgide", async () => {
    const tx = await renderEmail(codeSpec(), "tr", env);
    expect(tx.html).not.toContain("abonelikten çıkın");
    const n = await renderEmail(
      {
        template: "notification",
        data: { subject: "S", heading: "Yeni mesajınız var", paragraphs: ["Merhaba,"], ctaLabel: "Mesajları gör", ctaUrl: "https://www.rothern.com/company/mesajlar" },
      },
      "tr",
      { ...env, unsubscribeUrl: "https://www.rothern.com/api/email/unsubscribe?t=x" },
    );
    expect(n.html).toContain("abonelikten çıkın");
    expect(n.html).toContain("Aydınlatma Metni");
    expect(n.html).toContain('class="r-btn"');
    expect(n.html).toContain("background-color:#18181B");
  });
});

describe("e-posta tasarımı — kodlu e-posta", () => {
  const cases: Array<[Locale, string, string, string]> = [
    ["tr", "Doğrulama kodu", "Kod 15 dakika geçerlidir.", "Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz."],
    ["en", "Verification code", "The code is valid for 15 minutes.", "If you didn’t request this, you can safely ignore this email."],
    ["ru", "Код подтверждения", "Код действителен 15 минут.", "Если Вы не запрашивали код, просто проигнорируйте это письмо."],
  ];

  it.each(cases)("%s: kod bloğu + geçerlilik + yok sayın notu, önizleme ve düz metin", async (locale, label, validity, ignore) => {
    const out = await renderEmail(codeSpec(), locale, env);
    const text = visible(out.html);
    expect(out.html).toContain('class="r-code"');
    expect(out.html).toMatch(/class="r-code"[^>]*>488189</);
    expect(text).toContain(label);
    expect(text).toContain(validity);
    expect(text).toContain(ignore);
    // Görünen gövdede bir kez (kod bloğu) + gizli önizleme metninde bir kez.
    expect(count(text, "488189")).toBe(2);
    expect(out.html).toMatch(/display:none[^>]*>[^<]*488189/);
    // Düz metin: kod bir kez, geçerlilik ve not da var.
    expect(count(out.text, "488189")).toBe(1);
    expect(out.text).toContain(validity);
    expect(out.text).toContain(ignore);
    expect(out.text.trimEnd().endsWith("— Rothern")).toBe(true);
  });

  it("çağıranın notu (2FA ayar kodu) varsayılan notun yerine geçer", async () => {
    const out = await renderEmail(codeSpec({ footerNote: "Şifrenizi değiştirin." }), "tr", env);
    expect(visible(out.html)).toContain("Şifrenizi değiştirin.");
    expect(visible(out.html)).not.toContain("yok sayabilirsiniz");
    expect(out.text).toContain("Şifrenizi değiştirin.");
  });

  it("kodsuz bildirim kod bloğu çizmez, önizleme başlıktır", async () => {
    const out = await renderEmail(
      { template: "notification", data: { subject: "S", heading: "Teklifiniz kazandı", paragraphs: ["Merhaba,"] } },
      "tr",
      env,
    );
    expect(out.html).not.toContain('class="r-code"');
    expect(out.html).toMatch(/display:none[^>]*>Teklifiniz kazandı/);
  });
});

describe("e-posta tasarımı — ikinci tur gövde parçaları", () => {
  const base = { subject: "S", heading: "Başlık", paragraphs: ["Merhaba,"] };
  const notif = (data: Record<string, unknown>) =>
    renderEmail({ template: "notification", data: { ...base, ...data } } as EmailTemplateData, "tr", env);

  it("güvenlik uyarısı CTA'nın altında ayrı kutuda; düz metinde CTA'dan sonra", async () => {
    const out = await notif({
      paragraphs: ["Merhaba,", "Hesabınızın şifresi değiştirildi."],
      ctaLabel: "Hesap ayarları",
      ctaUrl: "https://www.rothern.com/company/ayarlar",
      alert: "Bu işlemi siz yapmadıysanız derhal şifrenizi sıfırlayın.",
    });
    const alertAt = out.html.indexOf('class="r-box r-panel r-alert"');
    expect(alertAt).toBeGreaterThan(-1);
    expect(alertAt).toBeGreaterThan(out.html.indexOf('class="r-btn"'));
    expect(out.text.indexOf("Bu işlemi siz yapmadıysanız")).toBeGreaterThan(out.text.indexOf("Hesap ayarları:"));
  });

  it("başlık + ikincil satır listesi: ayrıntısı olmayan satırda '—' basılmaz", async () => {
    const out = await notif({
      entries: [
        { title: "Cıvata (ROT-000042)", detail: "Son teklif: 12 Ekim 2026" },
        { title: "Rulman (ROT-000061)" },
      ],
    });
    const text = visible(out.html);
    expect(text).toContain("Cıvata");
    expect(text).toContain("Son teklif: 12 Ekim 2026");
    expect(text).not.toContain("—");
    expect(out.text).toContain("Cıvata (ROT-000042) — Son teklif: 12 Ekim 2026");
    expect(out.text).toMatch(/^Rulman \(ROT-000061\)$/m);
  });

  it("kalem satırı madde işaretli liste + '+N kalem daha'; düz metin birleşik değer", async () => {
    const out = await notif({
      infoRows: [
        { label: "Kalemler (8)", value: "Boru — 1 m · Flanş — 2 adet · +6 kalem daha", items: ["Boru — 1 m", "Flanş — 2 adet"], itemsNote: "+6 kalem daha" },
      ],
    });
    expect(out.html).toMatch(/<li[^>]*>Boru — 1 m<\/li>/);
    expect(out.html).toMatch(/<li[^>]*>Flanş — 2 adet<\/li>/);
    expect(out.html).not.toMatch(/<li[^>]*>\+6 kalem daha/);
    expect(visible(out.html)).toContain("+6 kalem daha");
    expect(out.text).toContain("Kalemler (8): Boru — 1 m · Flanş — 2 adet · +6 kalem daha");
  });

  it("talep/sipariş numarası satır sonunda bölünmez; düz metin değişmez", async () => {
    const out = await notif({ paragraphs: ["Merhaba,", "ORD-2026-0187 numaralı sipariş oluştu (ROT-000042)."] });
    expect(out.html).toContain('<span style="white-space:nowrap">ORD-2026-0187</span>');
    expect(out.html).toContain('<span style="white-space:nowrap">ROT-000042</span>');
    expect(out.text).toContain("ORD-2026-0187 numaralı sipariş oluştu (ROT-000042).");
  });

  it("çok uzun paragraf telefonda okunur cümle gruplarına bölünür; kısaltma bölünmez; düz metin tek paragraf", async () => {
    const long =
      "Paketinizin süresi doldu ve hesabınız ücretsiz Standart pakete geçirildi. " +
      "Standart pakette yeni satın alma talebi açamaz ve firma davet edemezsiniz; herkese açık talepleri alıcı adı gizli görürsünüz. " +
      "Delta Yapı Ltd. Şti. gibi bağlantılarınızın talepleri ücretsizdir. " +
      "Profiliniz ve vitrininiz dizinde kalır; vitrinde en fazla 50 ürün yayında olabilir. Mevcut taleplerinizi tamamlayabilirsiniz.";
    const out = await notif({ paragraphs: ["Merhaba,", long] });
    const paras = (out.html.match(/<p[^>]*class="r-text"[^>]*>[\s\S]*?<\/p>/g) ?? []).map((p) => visible(p).trim());
    // "Merhaba," + uzun paragrafın en az iki cümle grubu.
    expect(paras.length).toBeGreaterThanOrEqual(3);
    expect(paras.every((p) => p.length <= 240)).toBe(true);
    expect(paras.some((p) => p.includes("Delta Yapı Ltd. Şti. gibi"))).toBe(true);
    expect(out.text).toContain(long);
  });

  it("öne çıkan maddeler kutuda; düz metinde '- ' satırları", async () => {
    const out = await notif({ highlights: ["3 ürününüz taslağa alındı.", "Bekleyen davetler iptal edildi."] });
    expect(out.html).toMatch(/<li[^>]*>3 ürününüz taslağa alındı\.<\/li>/);
    expect(out.text).toContain("- 3 ürününüz taslağa alındı.");
  });

  it("davette alt bilgide çıkış bağlantısı varsa notta ikinci 'kapat' bağlantısı yok; yoksa notta kalır", async () => {
    const data = {
      inviterName: "Acme",
      tenderTitle: "Boru",
      categories: [],
      closesAt: null,
      registerUrl: "https://www.rothern.com/company/kayit",
      optOutUrl: "https://www.rothern.com/davet-kapat?token=t",
    };
    const withUnsub = await renderEmail({ template: "tender_external_invite", data }, "tr", {
      ...env,
      unsubscribeUrl: "https://www.rothern.com/e-posta-tercihleri?t=x",
    });
    expect(withUnsub.html).not.toContain("davet-kapat?token=t");
    expect(withUnsub.html).toContain("e-posta-tercihleri?t=x");
    expect(withUnsub.text).toContain("davet-kapat?token=t"); // düz metin opt-out satırı aynen
    const noUnsub = await renderEmail({ template: "tender_external_invite", data }, "tr", env);
    expect(noUnsub.html).toContain("davet-kapat?token=t");
  });
});

describe("e-posta tasarımı — güvenlik bildiriminin uyarı cümlesi (company-auth securityAlert)", () => {
  const keys = [
    ["api.notifications.companyAuth.ikiAdimliAcildiGovde", undefined],
    ["api.notifications.companyAuth.ikiAdimliKapatildiGovde", undefined],
    ["api.notifications.companyAuth.parolaDegistiGovde", undefined],
    ["api.notifications.companyAuth.ikiAdimliKilitGovde", { dakika: 15 }],
  ] as const;
  const notYou: Record<Locale, RegExp> = { tr: /siz yapmadıysanız/, en: /not you|did not do this/, ru: /не Вы/ };
  it.each(["tr", "en", "ru"] as const)("%s: son cümle 'siz yapmadıysanız' uyarısıdır, olay cümlesi gövdede kalır", (locale) => {
    for (const [key, params] of keys) {
      const sentences = splitSentences(tApi(key, params, locale));
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.at(-1)).toMatch(notYou[locale]);
      expect(sentences.slice(0, -1).join(" ")).not.toMatch(notYou[locale]);
    }
  });
});
