import { resolveSiteUrl } from "@/lib/site-url";
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
}

/**
 * Tek giriş noktası: sayfa metası. `alternates.canonical` her zaman yazılır —
 * süzgeçli varyantlar (`?sehir=`, `?sayfa=`) kanoniği kendi yolları olarak
 * bildirsin diye çağıran açıkça yol verir.
 */
export function buildMetadata({
  title,
  description,
  path,
  images,
  noindex,
  type = "website",
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const desc = clampDescription(description);
  // Varsayılan kart (2026-09-11 canlı denetim): Next'te kök `opengraph-image`
  // yalnız `/` için basılır, alt segmentlere MİRAS GEÇMEZ — /nasil-calisir ve
  // sözleşme sayfaları og:image'sız çıkıyordu. Görsel verilmeyen her sayfa kök
  // marka kartını alır; varlık sayfaları kendi kartını geçer.
  const abs = (images && images.length ? images : ["/opengraph-image"]).map((i) =>
    i.startsWith("http") ? i : absoluteUrl(i),
  );
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description: desc,
      url,
      siteName: SITE_NAME,
      locale: "tr_TR",
      type,
      images: abs,
    },
    twitter: {
      // Her herkese açık sayfanın 1200×630 kartı var (kök `opengraph-image`
      // + varlık bazlı `opengraph-image.tsx`, Parça 6) → büyük kart her yerde.
      card: "summary_large_image",
      title,
      description: desc,
      images: abs,
    },
  };
}
