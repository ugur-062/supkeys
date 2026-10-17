import { describe, expect, it } from "vitest";
import { rawMessages, type MessageTree } from "../messages";

/**
 * PROFİL AI METİN NÖBETÇİSİ (sahip kararı 2026-10-08).
 *
 * "Web sitesinden AI ile profil doldurma" kapandı: AI siteyi okumaz, yalnız
 * tanıtım metnini firmanın platformdaki verisinden (vitrindeki ürünler, firma
 * bilgileri) yazar ve bunu ÖNERİR; kullanıcı kontrol edip kaydeder.
 * 1) Hiçbir katalog metni (web / api / email / common; TR / EN / RU) "sitenizden
 *    AI ile dolduruyoruz / siteniz okunuyor / sitenizi girin, AI yazsın" demez.
 * 2) Kayıt adımındaki web sitesi ipucu yalnız "isteğe bağlı, profilde
 *    gösterilir" der; biçimli (<b>) vaat taşımaz.
 * 3) Profilim düğmesi ve e-posta ne yaptığını söyler: ürünlerden ve firma
 *    bilgilerinden TASLAK, kullanıcı kontrol eder.
 * 4) Eski "firma başına bir kez" cümlesi yok; sınır metni 6 öneriyi ve
 *    doğrulamayı söyler.
 */
const LOCALES = ["tr", "en", "ru"] as const;
type Loc = (typeof LOCALES)[number];
const NAMESPACES = ["web", "api", "email", "common"] as const;

function walk(node: MessageTree | string, path: string, out: [string, string][]): void {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out);
}

function pick(loc: Loc, ns: (typeof NAMESPACES)[number], path: string): string {
  const node = path.split(".").reduce<MessageTree | string | undefined>(
    (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
    rawMessages(loc, ns),
  );
  expect(typeof node, `${loc}:${ns}.${path}`).toBe("string");
  return node as string;
}

function has(loc: Loc, ns: (typeof NAMESPACES)[number], path: string): boolean {
  const node = path.split(".").reduce<MessageTree | string | undefined>(
    (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
    rawMessages(loc, ns),
  );
  return node !== undefined;
}

/** AI'ın firma SİTESİNİ okuyacağını / siteden dolduracağını söyleyen kalıplar. */
const SITE_PROMISE: Record<Loc, RegExp> = {
  tr: /siteni(z|zi|zden|zde)\b.{0,40}\b(AI|yapay zek)|\b(AI|yapay zek).{0,60}siteni(z|zi|zden|zde)\b|siteniz okunuyor|sitenizi okuy|web sitemden|siteden yeterli bilgi/i,
  en: /from (your|my) (web)?site|read(ing)? your website|enter your website and AI|extracted from the website|check your website/i,
  ru: /с Вашего сайта|по моему сайту|читаем Ваш сайт|прочитаем Ваш сайт|укажите сайт\s*—\s*ИИ|извлечь с сайта|проверьте Ваш сайт/i,
};

describe("profil AI metinleri — web sitesinden doldurma vaadi yok", () => {
  it.each(LOCALES)("%s: hiçbir katalog metni AI'ın siteyi okuyacağını / siteden dolduracağını söylemez", (loc) => {
    const hits: string[] = [];
    for (const ns of NAMESPACES) {
      const rows: [string, string][] = [];
      walk(rawMessages(loc, ns), ns, rows);
      for (const [path, text] of rows) if (SITE_PROMISE[loc].test(text)) hits.push(`${path}: ${text}`);
    }
    expect(hits).toEqual([]);
  });

  it.each(LOCALES)("%s: kayıt adımındaki web sitesi ipucu yalnız 'isteğe bağlı, profilde gösterilir' der", (loc) => {
    const hint = pick(loc, "web", "auth.onboarding.websiteHint");
    expect(hint).not.toMatch(/\bAI\b|yapay zek/i);
    // Büyük harf duyarlı: "компании" sözcüğü "ии" ile biter.
    expect(hint).not.toMatch(/ИИ/);
    // Düz metin: ekranda `t()` ile basılır, biçim etiketi taşımaz.
    expect(hint).not.toMatch(/<\/?[a-z]+>/i);
    expect(hint).toMatch({ tr: /İsteğe bağlı/, en: /Optional/, ru: /Необязательно/ }[loc]);
    expect(hint).toMatch({ tr: /profilinizde gösterilir/, en: /shown on your company profile/, ru: /отображается в профиле/ }[loc]);
  });

  it.each(LOCALES)("%s: site soran / siteden logo bulan eski Profilim anahtarları katalogda yok", (loc) => {
    for (const key of [
      "aiProfilOlusturamadiWebSitenizi",
      "sitenizOkunuyor",
      "webSitemdenAiIleDoldur",
      "webSitenizinAdresi",
      "adresKunyenizeDeKaydedilirSiteniz",
      "sitenizdeBirLogoBuldukIndirip",
      "sitenizdeBulunanGorsel",
      "webSiteniziOkuyupTaslakHazirlayalim",
    ]) {
      expect(has(loc, "web", `panel.company.profileEditor.${key}`), key).toBe(false);
    }
    for (const key of ["onceFirmaWebSiteniziEkleyinProfilim", "sitedenYeterliBilgiCikarilamadiProfiliElle", "profilAiBirKezDogrulama"]) {
      expect(has(loc, "api", `ai.${key}`), key).toBe(false);
    }
  });
});

describe("profil AI metinleri — ne yaptığını söyler", () => {
  const PRODUCTS: Record<Loc, RegExp> = { tr: /ürünleriniz/i, en: /products/i, ru: /товар/i };
  const COMPANY_DETAILS: Record<Loc, RegExp> = {
    tr: /firma bilgileriniz/i,
    en: /company details/i,
    ru: /данным (Вашей )?компании/i,
  };
  const DRAFT: Record<Loc, RegExp> = { tr: /tasla/i, en: /draft/i, ru: /черновик/i };

  it.each(LOCALES)("%s: boş tanıtım teklifi ürünleri + firma bilgilerini ve TASLAK olduğunu söyler", (loc) => {
    const body = pick(loc, "web", "panel.company.profileEditor.aboutAi.offerBody");
    expect(body).toMatch(PRODUCTS[loc]);
    expect(body).toMatch(COMPANY_DETAILS[loc]);
    expect(body).toMatch(DRAFT[loc]);
    // Düğme yalnız tanıtımı yazdığını söyler ("profili doldur" değil).
    const write = pick(loc, "web", "panel.company.profileEditor.aboutAi.write");
    expect(write).toMatch({ tr: /Tanıtımı AI ile yaz/, en: /Write the description with AI/, ru: /Написать описание/ }[loc]);
    expect(write).not.toMatch(/profil|profile|профил/i);
  });

  it.each(LOCALES)("%s: ürünsüz firmaya 'ürün ekledikçe zenginleşir' denir", (loc) => {
    expect(pick(loc, "web", "panel.company.profileEditor.aboutAi.noProducts")).toMatch(
      { tr: /Ürün ekledikçe öneri zenginleşir/, en: /richer as you add products/, ru: /Чем больше товаров/ }[loc],
    );
  });

  it.each(LOCALES)("%s: yaşam döngüsü e-postası site istemez; ürünlerden + firma bilgilerinden taslak, kullanıcı kontrol eder", (loc) => {
    const subject = pick(loc, "api", "notifications.lifecycle.profile.subject");
    const body = pick(loc, "api", "notifications.lifecycle.profile.body");
    expect(`${subject} ${body}`).not.toMatch({ tr: /web site|siteni/i, en: /website|your site/i, ru: /сайт/i }[loc]);
    expect(body).toMatch(PRODUCTS[loc]);
    expect(body).toMatch(COMPANY_DETAILS[loc]);
    expect(body).toMatch(DRAFT[loc]);
    expect(body).toMatch({ tr: /kontrol edip kaydedersiniz/, en: /you review it and save/, ru: /проверить его и сохранить/ }[loc]);
    // "bir kez" sözü kalktı (hak artık 6 başarılı öneri).
    expect(body).not.toMatch({ tr: /bir kez/i, en: /one time|\bonce\b/i, ru: /один раз/i }[loc]);
  });

  it.each(LOCALES)("%s: hak sınırı metni {limit} öneriyi ve doğrulamayı söyler; 'bir kez' demez", (loc) => {
    const text = pick(loc, "api", "ai.profilTanitimHakkiDoldu");
    expect(text).toContain("{limit}");
    expect(text).toMatch({ tr: /firmanızı doğrulayın/i, en: /verify your company/i, ru: /проверку компании/i }[loc]);
    expect(text).not.toMatch({ tr: /bir kez/i, en: /\bonce\b/i, ru: /один раз/i }[loc]);
  });

  it.each(LOCALES)(
    "%s: ücretli çağrı tavanının KENDİ metni var — deneme sınırını ve doğrulamayı söyler, 'önerilerin hepsini aldınız' demez",
    (loc) => {
      // Tam erişimi olmayan firmayı İKİ tavan durdurur: 6 başarılı öneri ya da 18
      // ücretli çağrı. İkincisinde firma 6 öneri ALMAMIŞTIR; "toplam 6 öneri
      // alabilirsiniz, hakkınız doldu" metni orada yanlıştır.
      const text = pick(loc, "api", "ai.profilTanitimDenemeSiniriDoldu");
      expect(text).toContain("{limit}");
      expect(text).toMatch({ tr: /deneme sınırı/i, en: /attempt limit/i, ru: /лимит попыток/i }[loc]);
      // Taslak üretmeyen denemelerin de sayıldığı söylenir (sınıra neden dayandığı anlaşılsın).
      expect(text).toMatch({ tr: /taslak üretmeyen denemeler/i, en: /did not produce a draft/i, ru: /не давшие черновика/i }[loc]);
      expect(text).toMatch({ tr: /firmanızı doğrulayın/i, en: /verify your company/i, ru: /проверку компании/i }[loc]);
      expect(text).not.toMatch({ tr: /hakkınız doldu/i, en: /used all of them/i, ru: /исчерпали/i }[loc]);
      // İki tavanın metni ayrışır.
      expect(text).not.toBe(pick(loc, "api", "ai.profilTanitimHakkiDoldu"));
    },
  );

  it.each(LOCALES)("%s: kullanım ekranı ve aktivite kaydı etiketleri 'web sitesi' demez", (loc) => {
    const labels = [
      pick(loc, "web", "domain.aiFeature.profile_enrich"),
      pick(loc, "web", "domain.auditAction.company_profile_enriched"),
      pick(loc, "web", "domain.auditAction.company_profile_enrich_attempt"),
      pick(loc, "web", "domain.auditAction.company_profile_enrich_settled"),
    ].join(" | ");
    expect(labels).not.toMatch(/web sit|website|сайт/i);
  });
});
