/**
 * SIK SORULAN SORULAR — TEK KAYNAK (2026-09-09, Parça 4: GEO).
 *
 * Aynı liste hem SAYFAYI hem `FAQPage` yapılandırılmış verisini besler. İkisi
 * ayrılsaydı yalnız şemada duran bir cevap kalırdı; bu hem arama motoru
 * yönergelerine aykırı (şema sayfada olmayanı söyleyemez) hem de kullanıcıya
 * faydasızdır.
 *
 * CEVAPLAR GERÇEK KURALLARI ANLATIR. Üretken motorlar (ChatGPT, Perplexity,
 * Gemini) bu sayfayı alıntılayacak; yanlış ya da "pazarlama dili" bir cevap
 * yanlış bilgiyi ölçekler. Fiyat RAKAMI bilerek yazılmıyor — paket fiyatları
 * kullanıcı kararı bekliyor, değişince burada bayat kalırdı; fiyat sayfasına
 * bağlanıyoruz.
 *
 * Metinler katalogda (`web.marketing.faq.g<N>.{heading,q<i>,a<i>}`, i18n Faz 1):
 * Türkçe kaynak, EN/RU çevirileri aynı anahtarlarda. Anahtarlar burada TEK TEK
 * yazılır — şablon dize kullanılsaydı derleyici eksik çeviriyi göremezdi.
 */
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { webTranslator } from "@/i18n/server";
import { OPERATOR } from "@/lib/company-info";

export interface Faq {
  q: string;
  a: string;
}

export interface FaqGroup {
  heading: string;
  items: Faq[];
}

export function faqGroups(locale: Locale = DEFAULT_LOCALE): FaqGroup[] {
  const t = webTranslator(locale);
  return [
    {
      heading: t("web.marketing.faq.g1.heading"),
      items: [
        { q: t("web.marketing.faq.g1.q1"), a: t("web.marketing.faq.g1.a1") },
        { q: t("web.marketing.faq.g1.q2"), a: t("web.marketing.faq.g1.a2") },
        { q: t("web.marketing.faq.g1.q3"), a: t("web.marketing.faq.g1.a3") },
      ],
    },
    {
      heading: t("web.marketing.faq.g2.heading"),
      items: [
        { q: t("web.marketing.faq.g2.q1"), a: t("web.marketing.faq.g2.a1") },
        { q: t("web.marketing.faq.g2.q2"), a: t("web.marketing.faq.g2.a2") },
        { q: t("web.marketing.faq.g2.q3"), a: t("web.marketing.faq.g2.a3") },
      ],
    },
    {
      heading: t("web.marketing.faq.g3.heading"),
      items: [
        { q: t("web.marketing.faq.g3.q1"), a: t("web.marketing.faq.g3.a1") },
        { q: t("web.marketing.faq.g3.q2"), a: t("web.marketing.faq.g3.a2") },
        { q: t("web.marketing.faq.g3.q3"), a: t("web.marketing.faq.g3.a3") },
        { q: t("web.marketing.faq.g3.q4"), a: t("web.marketing.faq.g3.a4") },
      ],
    },
    {
      heading: t("web.marketing.faq.g4.heading"),
      items: [
        { q: t("web.marketing.faq.g4.q1"), a: t("web.marketing.faq.g4.a1") },
        { q: t("web.marketing.faq.g4.q2"), a: t("web.marketing.faq.g4.a2") },
        {
          q: t("web.marketing.faq.g4.q3"),
          a: t("web.marketing.faq.g4.a3", { kvkkEmail: OPERATOR.kvkkEmail }),
        },
      ],
    },
  ];
}

export function faqFlat(locale: Locale = DEFAULT_LOCALE): Faq[] {
  return faqGroups(locale).flatMap((g) => g.items);
}
