import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LOCALES, type Locale } from "@rothern/i18n";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";
import { OPERATOR } from "@/lib/company-info";

/**
 * HESAP SİLME SAYFASI (2026-10-16) — Google Play "hesap silme adresi" ve Apple
 * "User Privacy Choices URL" bu sayfa. Mağaza koşulları sözleşme olarak:
 * girişsiz açılır (herkese açık rota), uygulama ve geliştirici adını anar,
 * adımlar uygulamadaki GERÇEK etiketlerle yazılır (panel kataloğuyla aynı, üç
 * dilde), Hesap Bilgileri sayfasına ve uygulamasız yol olarak KVKK e-postasına
 * bağlanır, saklanan bilgileri ve özel durumları söyler.
 */
const h = vi.hoisted(() => ({ locale: "tr" as string }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("use-intl/core");
  const { messagesFor: load, WEB_NAMESPACES: ns } = await import("@rothern/i18n/messages");
  const make = (locale: string, namespace?: string) =>
    createTranslator({
      locale: locale as Locale,
      messages: load(locale as Locale, ns),
      namespace: namespace as never,
      timeZone: "Europe/Istanbul",
      onError: () => {},
      getMessageFallback: ({ namespace: n, key }) => `MISSING:${n}.${key}`,
    });
  return {
    getTranslations: async (arg?: string | { locale?: string; namespace?: string }) =>
      typeof arg === "string" ? make(h.locale, arg) : make(arg?.locale ?? h.locale, arg?.namespace),
    setRequestLocale: () => {},
    getLocale: async () => h.locale,
  };
});
vi.mock("@/components/marketplace/public-layout", () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
// Dil ön ekini gerçek çeviriyle ekleyen bağlantı (sayfa İÇ yol yazar).
vi.mock("@/i18n/navigation", async () => {
  const { localizePath } = await import("@/i18n/href");
  return {
    Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
      <a href={localizePath(href, h.locale as Locale)} className={className}>
        {children}
      </a>
    ),
  };
});

const { default: Page, generateMetadata } = await import("../page");

async function render(locale: Locale): Promise<string> {
  h.locale = locale;
  const el = await Page({ params: Promise.resolve({ locale }) });
  return renderToStaticMarkup(el);
}

/** Katalogdan düz metin (ICU etiketleri ve yer tutucular olmadan). */
function msg(locale: Locale, key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messagesFor(locale, WEB_NAMESPACES));
  if (typeof value !== "string") throw new Error(`katalogda yok: ${locale} ${key}`);
  return value;
}
/** HTML'deki metin: etiketler atılır, varlıklar çözülür. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

const SETTINGS_ACCOUNT: Record<Locale, string> = {
  tr: "/company/ayarlar/hesap-bilgileri",
  en: "/en/company/settings/account",
  ru: "/ru/kompaniya/nastroyki/akkaunt",
};
const PRIVACY: Record<Locale, string> = {
  tr: "/sozlesmeler/gizlilik",
  en: "/en/legal/privacy",
  ru: "/ru/dokumenty/konfidentsialnost",
};
/** Saklama süreleri tek kaynağı: Kişisel Veri Saklama ve İmha Politikası. */
const RETENTION_POLICY: Record<Locale, string> = {
  tr: "/sozlesmeler/saklama-imha",
  en: "/en/legal/data-retention",
  ru: "/ru/dokumenty/khranenie-dannykh",
};
/** Mağaza konsollarına yazılan adresler (`docs/store-listing.md`). */
const SELF: Record<Locale, string> = {
  tr: "/hesap-silme",
  en: "/en/account-deletion",
  ru: "/ru/udalenie-akkaunta",
};

describe("hesap silme sayfası", () => {
  it.each(LOCALES)("%s: uygulama ve geliştirici adı, adımlar, Hesap Bilgileri bağlantısı, e-posta yolu", async (locale) => {
    const html = await render(locale);
    const body = text(html);
    expect(html).not.toContain("MISSING:");
    expect(body).toContain("Rothern");
    expect(body).toContain(OPERATOR.legalName);
    // Silme yolu sayfanın ilk bölümü, dört adım.
    expect(html.indexOf('id="adimlar"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="adimlar"')).toBeLessThan(html.indexOf('id="giris-yapamiyorsaniz"'));
    expect(html.match(/<li class="flex gap-3">/g)).toHaveLength(4);
    // Panelin Hesap Bilgileri sayfası o dilin adresiyle; uygulamasız yol KVKK e-postası.
    expect(html).toContain(`href="${SETTINGS_ACCOUNT[locale]}"`);
    expect(html).toContain(`href="mailto:${OPERATOR.kvkkEmail}"`);
    expect(body).toContain(OPERATOR.kvkkEmail);
    // Ayrıntı ve hukuki metinler.
    expect(html).toContain(`href="${PRIVACY[locale]}"`);
    for (const id of ["silinenler", "saklananlar", "ozel-durumlar", "kismi-silme"]) expect(html).toContain(`id="${id}"`);
  });

  it.each(LOCALES)("%s: adımlar panelin GERÇEK etiketlerini kullanır (Ayarlar › Hesap Bilgileri, düğmeler, sonuç bildirimi)", async (locale) => {
    const body = text(await render(locale));
    const labels = [
      msg(locale, "web.panel.settings.ayarlarPage.ayarlar"),
      msg(locale, "web.panel.settings.settingsPages.hesap.title"),
      msg(locale, "web.panel.settings.deleteAccountSection.title"),
      msg(locale, "web.panel.settings.deleteAccountSection.open"),
      // Şifre formu kurulum sihirbazı ve sözleşme onayı penceresiyle ortak (web.auth).
      msg(locale, "web.auth.deleteAccount.open"),
      msg(locale, "web.auth.deleteAccount.confirm"),
      msg(locale, "web.auth.deleteAccount.done"),
      msg(locale, "web.panel.settings.settingsPages.kullanicilar.title"),
      msg(locale, "web.panel.settings.settingsPages.aktivite.title"),
    ];
    for (const label of labels) expect(body, `${locale}: "${label}"`).toContain(label);
  });

  /* Mağaza incelemesi 2026-10-16: kurulumu bitmemiş hesap Ayarlar'a giremez →
     o ekrandaki düğme anılır; ek adımı yerine getiremeyen için destek yolu
     (Google Play); doğrulanmamış kayıt kendiliğinden silinir; kayıt "anonim"
     DEĞİL (kimliği firma kayıtlarına bağlı kalır) — hiçbir dilde öyle yazılmaz. */
  it.each(LOCALES)("%s: kurulum ekranı yolu, destek yolu, doğrulanmamış kayıt; 'anonim' sözü yok", async (locale) => {
    const html = await render(locale);
    const body = text(html);
    expect(body).toContain(text(msg(locale, "web.marketing.accountDeletion.stepsSetupNote")));
    const special = html.slice(html.indexOf('id="ozel-durumlar"'), html.indexOf('id="kismi-silme"'));
    expect(special).toContain(`href="mailto:${OPERATOR.kvkkEmail}"`);
    expect(special.match(/<li>/g)).toHaveLength(6);
    // Kök eşleşmesi: "anonim olarak", "anonymized", "anonymous", "анонимно",
    // "обезличен…" de yakalanır (CLAUDE.md: metinlerde "anonim" yazılmaz).
    expect(body).not.toMatch(/anonim|anonym|аноним|обезлич/i);
    expect(body).toMatch(/10/);
  });

  /* İnceleme 2026-10-16: Kurucu kuruculuğu devredip hesabını silerse kendi
     kimlik numarası ve kimlik belgesi görüntüleri firma kaydında kalır; Play'in
     EN adresi tek kaynak olduğu için saklananlar listesi bunu üç dilde söyler. */
  it.each(LOCALES)("%s: firma kaydında kalan yetkili kimlik bilgisi saklananlarda yazılı", async (locale) => {
    const html = await render(locale);
    const section = html.slice(html.indexOf('id="saklananlar"'), html.indexOf('id="ozel-durumlar"'));
    expect(text(section)).toContain(text(msg(locale, "web.marketing.accountDeletion.kept6")));
    expect(section.match(/<li>/g)).toHaveLength(6);
  });

  /* 2026-10-16: saklananlar Saklama ve İmha Politikası tablosuyla aynı süreleri
     söyler ve politikaya bağlanır (ticari kayıt 10 yıl yıl sonundan, IP 2 yıl
     dolmadan, erişim kaydı en fazla 2 yıl — 2026-10-22 yayın günü doğru olan üst
     sınır, kapalı kova + 400 gün kurulunca rakam yazılır; ret kaydı süresiz). */
  it.each(LOCALES)("%s: saklananlar politikanın süreleriyle; politikaya bağlantı", async (locale) => {
    const html = await render(locale);
    const section = html.slice(html.indexOf('id="saklananlar"'), html.indexOf('id="ozel-durumlar"'));
    expect(section).toContain(`href="${RETENTION_POLICY[locale]}"`);
    const body = text(section);
    expect(body).toMatch(/10/);
    expect(body).toMatch(/2/);
    expect(body).toContain("5651");
  });

  it("tr: saklama süreleri politikadaki ifadelerle", async () => {
    const body = text(await render("tr"));
    expect(body).toContain("kaydın oluştuğu takvim yılının sonundan itibaren 10 yıl");
    expect(body).toContain("2 yıl dolmadan silinir");
    expect(body).toContain("Sunucu erişim (trafik) kayıtları en fazla 2 yıl saklanır (5651 sayılı Kanun m. 5/3)");
    expect(body).not.toMatch(/en az 1/);
    expect(body).toContain("süresiz saklanır");
  });

  /* Yayın günü doğru (2026-10-22): iOS uygulaması henüz yayında değil → giriş
     "mobil uygulamalar" der; iki mağaza da canlı olunca "iOS ve Android"e döner
     (docs/kvkk-uyum.md "Yayın sonrası açık adımlar"). */
  it.each(LOCALES)("%s: giriş platformu web sitesi ve mobil uygulamalar olarak anar, iOS / Android adı yok", async (locale) => {
    const body = text(await render(locale));
    const intro = msg(locale, "web.marketing.accountDeletion.intro")
      .replace(/<\/?b>/g, "")
      .replace("{legalName}", OPERATOR.legalName);
    expect(body).toContain(intro);
    expect(body).not.toMatch(/iOS|Android/);
  });

  it.each(LOCALES)("%s: anonimleştirilmiş kaydın adı sunucunun yazdığı yer tutucu", async (locale) => {
    // `AccountDeletionService` adı TEK dilde (Türkçe) yazar; sayfa onu anar.
    const body = text(await render(locale));
    expect(body).toContain("Silinmiş Kullanıcı");
  });

  it.each(LOCALES)("%s: meta katalogdan; sayfa çevrildiği için kanonik kendi dilinde, hreflang üç dil", async (locale) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(meta.title).toBe(msg(locale, "web.marketing.accountDeletion.metaTitle"));
    expect(String(meta.alternates?.canonical ?? "")).toMatch(new RegExp(`^https?://[^/]+${SELF[locale]}$`));
    expect(Object.keys(meta.alternates?.languages ?? {}).sort()).toEqual(["en", "ru", "tr", "x-default"]);
    expect(meta.robots).not.toMatchObject({ index: false });
  });
});
