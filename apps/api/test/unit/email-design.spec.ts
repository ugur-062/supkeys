import { renderEmail, type EmailTemplateData } from "@rothern/email";
import type { Locale } from "@rothern/i18n";

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
  it("logo kartın içinde, alt metinli, 142×40; logo dışında görsel/uzak kaynak/SVG yok", async () => {
    const { html } = await renderEmail(codeSpec(), "tr", env);
    const card = html.indexOf('class="r-card"');
    const logo = html.indexOf('src="cid:rothern-logo"');
    expect(card).toBeGreaterThan(-1);
    expect(logo).toBeGreaterThan(card);
    const logoTag = html.match(/<img[^>]*src="cid:rothern-logo"[^>]*>/)?.[0] ?? "";
    expect(logoTag).toContain('alt="Rothern"');
    expect(logoTag).toContain('width="142"');
    expect(logoTag).toContain('height="40"');
    const imgs = html.match(/<img[^>]*src="([^"]+)"/g) ?? [];
    expect(imgs).toHaveLength(1);
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
        data: { subject: "S", heading: "Yeni mesajınız var", paragraphs: ["Merhaba,"], ctaLabel: "Mesajları Gör", ctaUrl: "https://www.rothern.com/company/mesajlar" },
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
    ["en", "Verification code", "The code is valid for 15 minutes.", "If you didn't request this, you can safely ignore this email."],
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
