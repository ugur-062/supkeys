import { localizePath, localizedAlternates } from "@/i18n/href";
import { resolveSiteUrl } from "@/lib/site-url";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@rothern/i18n";
import type { Metadata } from "next";

/**
 * SEO/GEO TEK KAYNAĞI — başlık, açıklama ve kanonik üretimi (2026-09-09).
 *
 * Kullanıcı kararı: "otomatik olarak eklenen her firma, ürün, talepte SEO ve
 * GEO çok yüksek olmalı." Bunun tek yolu, her sayfanın metasını ELLE değil
 * ŞABLONDAN üretmek: yeni bir varlık sayfası eklendiğinde geliştirici
 * `buildMetadata`ı çağırır ve kanonik + OG + Twitter + robots yönergeleri
 * otomatik gelir. Elle yazılan `metadata` nesneleri zamanla ayrışıyordu —
 * canlıda `/hakkimizda` başlığı "Hakkımızda — Rothern · Rothern" çıkıyor,
 * iki sayfa da anasayfanın açıklamasını miras alıyordu (2026-09-09 denetimi).
 *
 * GEO notu: üretken arama motorları (ChatGPT, Perplexity, Gemini) sayfayı
 * ALINTILAYIP kaynak gösterir. Alıntılanabilirliğin ön koşulu, sayfanın ne
 * olduğunu TEK CÜMLEDE söyleyen bir açıklama ve tutarlı kanoniktir; bu yüzden
 * açıklama "boş bırakılabilir" bir alan değil, üretimi zorunlu bir alandır.
 */

export const SITE_NAME = "Rothern";

/** Kanonik mutlak adres. Göreli yol verilir, base tek yerden çözülür. */
export function absoluteUrl(path: string): string {
  const site = resolveSiteUrl();
  if (!path || path === "/") return `${site}/`;
  return `${site}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Meta açıklaması için metni tek satıra indirir ve KELİME SINIRINDA keser.
 * Ortadan kesilen bir cümle hem arama sonucunda hem AI özetinde yarım
 * okunur; 160 karakter Google'ın masaüstünde gösterdiği tipik üst sınır.
 */
export function clampDescription(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Virgülle birleştirir, boşları atar. Şablon başlık/açıklamalarında veri
 * eksikse cümlenin "İstanbul,  · " gibi boşluklu kalmaması için.
 */
export function joinParts(parts: Array<string | null | undefined>, sep = " · "): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join(sep);
}

export interface PageMetaInput {
  /** Marka EKLENMEZ — kök şablon (`%s · Rothern`) onu zaten ekliyor. */
  title: string;
  description: string;
  /** Site köküne göre yol (`/urunler`), kanonik buradan üretilir. */
  path: string;
  /** Mutlak ya da göreli görsel adresleri; göreli olanlar tamamlanır. */
  images?: string[];
  noindex?: boolean;
  type?: "website" | "article" | "profile";
  /** Sayfanın dili (i18n Faz 1): kanonik o dilin adresi, hreflang hazır diller + x-default. */
  locale?: Locale;
  /**
   * Sayfanın KENDİ DİLİNDE hazır olduğu diller (2026-09-27 SEO denetimi):
   * hreflang ve `og:locale:alternate` YALNIZ bunları listeler, `x-default` hazır
   * İLK dile (tr → en → ru) gider. Verilmezse üç dil. Varlık sayfaları API'nin
   * `readyLocales`ını geçer — sitemap'le aynı kural (eskiden sayfa hep üç dil
   * yazıyordu: çevirisi bekleyen ürün `hreflang="en"` ile noindex sayfayı ilan
   * ediyordu). Sayfanın dili listede yoksa ve sayfa indekslenebilirse kanonik
   * hazır ilk dile işaret eder (sözleşme metinleri: `LEGAL_DOC_LOCALES`).
   */
  locales?: readonly Locale[];
  /**
   * Sayfalama (2026-09-27, Google önerisi): N>1 ise kanonik ve hreflang
   * `?sayfa=N` — her sayfa KENDİ kanoniğidir (eskiden hepsi 1. sayfayı
   * gösteriyordu, 2+ sayfadaki kayıtlar keşfedilmiyordu). Başka süzgeç varken
   * çağıran 1 geçer (süzgeçli varyant tabana işaret eder) — `canonicalListPage`.
   */
  page?: number;
  /**
   * Sayfa N>1 iken başlığa (` — Sayfa N`) ve açıklamaya eklenen yerelleştirilmiş
   * etiket (`web.shared.ui.pageN`). Kanonik `?sayfa=N` olan her sayfa
   * indekslenebilir; 1. sayfayla aynı başlık/açıklama yinelenen meta sayılıyordu
   * (arayüz testi D-084). `page` ≤ 1 ise yok sayılır.
   */
  pageLabel?: string;
  /** og:image:alt / twitter:image:alt — verilmezse başlık (sayfanın dilinde). */
  imageAlt?: string;
}

/**
 * Segmentin KENDİ OG kartının adresi (`<segment>/opengraph-image.tsx`), sayfanın
 * dilinde. Next'in dosya kuralı kartı og:image'a YAZMIYOR — `buildMetadata`
 * her zaman `openGraph.images` verdiği için config kazanıyor (2026-09-27 yerel
 * üretim sunucusunda ölçüldü) → kartı kullanmak isteyen sayfa bu adresi
 * `images` ile geçer. Biçim: dil ön eki + İÇ yol (`/en/urunler/sehir/x/
 * opengraph-image`): çevrilmiş yol + `/opengraph-image` bir rota şablonu
 * değil, next-intl onu 404'e düşürüyor; ön ekli iç yol ise `[locale]`
 * segmentine olduğu gibi geçiyor (200, ölçüldü).
 */
export function ogCardPath(path: string, locale: Locale = DEFAULT_LOCALE): string {
  const card = `${path === "/" ? "" : path.replace(/\/$/, "")}/opengraph-image`;
  return locale === DEFAULT_LOCALE ? card : `/${locale}${card}`;
}

/** OG kartı boyutu — kart çizimi (`og/card.tsx`) ve og:image boyut etiketleri aynı sabitten. */
export const OG_CARD_SIZE = { width: 1200, height: 630 } as const;

export const OG_LOCALE: Record<Locale, string> = { tr: "tr_TR", en: "en_US", ru: "ru_RU" };
/** JSON-LD `inLanguage` (BCP 47) — sayfanın dili; sözleşme metinleri istisna (her dilde tr-TR, `LegalDoc`). */
export const LANG_TAG: Record<Locale, string> = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };

/**
 * SÖZLEŞME METİNLERİ YALNIZ TÜRKÇE (hukuki metin çevrilmez): EN/RU sayfa açılır
 * (kabuk + "Türkçe metin esastır" notu) ama kanoniği Türkçe adres, hreflang ve
 * sitemap yalnız Türkçe — Türkçe gövdeli EN/RU sayfa kendi kanoniğiyle
 * indekslenmesin (2026-09-27 SEO denetimi, kullanıcı kararı).
 */
export const LEGAL_DOC_LOCALES: readonly Locale[] = [DEFAULT_LOCALE];

/** Hazır diller (LOCALES sırasıyla); boş/verilmemiş → üç dil. */
export function readyLocalesOf(locales?: readonly string[] | null): Locale[] {
  if (!locales) return [...LOCALES];
  return LOCALES.filter((l) => locales.includes(l));
}

/**
 * hreflang haritası (mutlak): yalnız hazır diller + `x-default` hazır İLK dile.
 * Sayfa metası ve sitemap AYNI kuralı okur (`located`).
 */
export function hreflangMap(path: string, locales?: readonly Locale[], query = ""): Record<string, string> {
  const ready = readyLocalesOf(locales);
  const out: Record<string, string> = {};
  for (const [lang, p] of Object.entries(localizedAlternates(path, ready))) out[lang] = `${absoluteUrl(p)}${query}`;
  return out;
}

/**
 * Gösterilen İÇERİĞİN dili sayfanın dilinden farklıysa onun etiketi (yoksa
 * undefined): kayıt bu dilde hazır değilken (çeviri bekliyor, Almanca kaynak…)
 * sayfa özgün metni gösterir — o blok `lang={…}` taşımalı, JSON-LD
 * `inLanguage` da onu söylemeli (2026-09-27: EN sayfada `<html lang="en">`
 * altında Türkçe h1 ve gövde). Kaynak bilinmiyorsa ("und") yazılmaz.
 */
export function contentLangOf(
  state: { readyLocales?: readonly string[] | null; sourceLocale?: string | null },
  locale: Locale,
): string | undefined {
  if (!state.readyLocales || state.readyLocales.includes(locale)) return undefined;
  const src = state.sourceLocale ?? DEFAULT_LOCALE;
  return src !== "und" && /^[a-z]{2,3}$/.test(src) && src !== locale ? src : undefined;
}

/** Sayfalama sorgusu: yalnız N>1 yazılır. */
export function pageQuery(page?: number): string {
  return page && page > 1 ? `?sayfa=${page}` : "";
}

/** OG kartı adresi mi (`…/opengraph-image`) — boyutu bilinen tek görsel türü. */
function isOgCard(url: string): boolean {
  return /\/opengraph-image(?:$|\?)/.test(url);
}

/**
 * Arama motoru sahiplik doğrulama meta etiketleri (kök düzen, env'den).
 * Boş değer etiket üretmez; hiçbiri yoksa `verification` hiç yazılmaz.
 */
export function siteVerification(env: { google?: string; bing?: string; yandex?: string }): Pick<Metadata, "verification"> {
  const google = env.google?.trim();
  const bing = env.bing?.trim();
  const yandex = env.yandex?.trim();
  if (!google && !bing && !yandex) return {};
  return {
    verification: {
      ...(google ? { google } : {}),
      ...(yandex ? { yandex } : {}),
      ...(bing ? { other: { "msvalidate.01": bing } } : {}),
    },
  };
}

/**
 * Tek giriş noktası: sayfa metası. `alternates.canonical` her zaman yazılır —
 * süzgeçli varyantlar (`?sehir=`) kanoniği kendi yolları olarak bildirsin diye
 * çağıran açıkça yol verir; sayfalama `page` ile.
 */
export function buildMetadata({
  title: baseTitle,
  description: baseDescription,
  path,
  images,
  noindex,
  type = "website",
  locale = DEFAULT_LOCALE,
  locales,
  page,
  pageLabel,
  imageAlt,
}: PageMetaInput): Metadata {
  const ready = readyLocalesOf(locales);
  const query = pageQuery(page);
  const paged = !!query && !!pageLabel;
  const title = paged ? `${baseTitle} — ${pageLabel}` : baseTitle;
  const description = paged ? `${pageLabel} · ${baseDescription}` : baseDescription;
  // Sayfanın dili hazır değilse ve sayfa indekslenebilirse kanonik hazır dile
  // (sözleşme metinleri). `noindex` sayfa kendi adresini söyler — Google
  // noindex + başka kanonik birleşimini çelişkili sayar.
  const canonicalLocale = !noindex && ready.length > 0 && !ready.includes(locale) ? ready[0]! : locale;
  const url = `${absoluteUrl(localizePath(path, canonicalLocale))}${query}`;
  const languages = hreflangMap(path, ready, query);
  const desc = clampDescription(description);
  // Varsayılan kart (2026-09-11 canlı denetim): Next'te kök `opengraph-image`
  // yalnız `/` için basılır, alt segmentlere MİRAS GEÇMEZ — /nasil-calisir ve
  // sözleşme sayfaları og:image'sız çıkıyordu. Görsel verilmeyen her sayfa kök
  // marka kartını alır; varlık sayfaları kendi kartını geçer. Kart sayfanın
  // DİLİNDE (2026-09-27): ön eksiz `/opengraph-image` Türkçe karttır — EN/RU
  // sayfa `/en/opengraph-image` alır (`[locale]/opengraph-image.tsx`).
  const fallback = ogCardPath("/", locale);
  const alt = imageAlt ?? title;
  // og:image:alt + boyut (2026-09-27): OG kartı 1200×630 bilinir; firma/ürün
  // fotoğrafının boyutu bilinmez, yazılmaz (uydurma yok).
  const abs = (images && images.length ? images : [fallback]).map((i) => {
    const u = i.startsWith("http") ? i : absoluteUrl(i);
    return isOgCard(u) ? { url: u, alt, ...OG_CARD_SIZE } : { url: u, alt };
  });
  const alternateLocale = ready.filter((l) => l !== locale).map((l) => OG_LOCALE[l]);
  return {
    title,
    description: desc,
    alternates: { canonical: url, languages },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description: desc,
      url,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      ...(alternateLocale.length ? { alternateLocale } : {}),
      type,
      images: abs,
    },
    twitter: {
      // Her herkese açık sayfanın 1200×630 kartı var (kök `opengraph-image`
      // + varlık bazlı `opengraph-image.tsx`, Parça 6) → büyük kart her yerde.
      card: "summary_large_image",
      title,
      description: desc,
      images: abs.map(({ url: u, alt: a }) => ({ url: u, alt: a })),
    },
  };
}
