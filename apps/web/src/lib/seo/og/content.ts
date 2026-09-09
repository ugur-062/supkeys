import { productPrice } from "@/lib/public/product-price";
import type { PublicListingDetail, PublicProduct, PublicProductCompany, PublicProfile } from "@/lib/public/marketplace-api";
import { joinParts } from "@/lib/seo/meta";

/**
 * OG KARTI İÇERİĞİ — saf veri, JSX yok (SEO Parça 6).
 *
 * Her herkese açık sayfa paylaşıldığında (LinkedIn, WhatsApp, X, Slack) ve
 * üretken motorların kaynak kartlarında 1200×630 bir görsel ister. Görseli
 * olmayan sayfa metin bağlantısı olarak kalır — tıklanma yarı yarıya düşer.
 * Bu modül SAYFANIN OLGULARINI karta indirger; çizim `card.tsx`te.
 *
 * KURAL: `entities.ts` ile aynı — uydurma yok; veri yoksa satır yazılmaz.
 * İLAN SAHİBİ ANONİM: `listingOgContent` firma adını parametre olarak bile
 * almaz; `content.test.ts` çıktıyı tarar.
 */

export interface OgContent {
  /** Küçük üst etiket: "ÜRÜN", "FİRMA", "ALIM TALEBİ", "KATEGORİ", "ŞEHİR". */
  eyebrow: string;
  title: string;
  /** Başlığın altındaki tek satır (firma · şehir gibi). */
  subtitle: string | null;
  /** En fazla 3 olgu çipi (fiyat, MOQ, ürün sayısı…). */
  facts: string[];
  /** Sağ panelde gösterilecek görsel (mutlak URL) — yoksa tipografik kart. */
  image: string | null;
  /** Küçük rozet: "Doğrulanmış firma", "Teklife açık". */
  badge: string | null;
}

const MAX_TITLE = 90;

function clampTitle(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_TITLE) return flat;
  const cut = flat.slice(0, MAX_TITLE - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > MAX_TITLE * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function productOgContent(product: PublicProduct, company: PublicProductCompany): OgContent {
  const price = productPrice(product);
  return {
    eyebrow: product.category?.name ? `ÜRÜN · ${product.category.name.toUpperCase()}` : "ÜRÜN",
    title: clampTitle(product.name),
    subtitle: joinParts([company.name, company.city], " · ") || null,
    facts: [
      price.hasPrice ? price.headline : "Fiyat için teklif isteyin",
      product.moq ? `Min. ${product.moq} ${product.unit}` : null,
      product.brand ? product.brand : null,
    ].filter((f): f is string => !!f),
    image: product.images[0] ?? null,
    badge: company.verified ? "Doğrulanmış tedarikçi" : null,
  };
}

export function companyOgContent(p: PublicProfile): OgContent {
  return {
    eyebrow: "FİRMA",
    title: clampTitle(p.name),
    subtitle: joinParts([p.industry, p.city], " · ") || null,
    facts: [
      p.productCount > 0 ? `${p.productCount} ürün vitrinde` : null,
      p.foundedYear ? `${p.foundedYear}'den beri` : null,
      p.employeeCount ? `${p.employeeCount} çalışan` : null,
    ].filter((f): f is string => !!f),
    image: p.coverImageUrl ?? p.logoUrl ?? null,
    badge: p.verified ? "Doğrulanmış firma" : null,
  };
}

/**
 * ALIM TALEBİ — sahibin adı/logosu YOK (CLAUDE.md § İLAN SAHİBİ ANONİM).
 * Konum ve nitelik kalır: "kim alıyor" değil "nerede, ne kadar".
 */
export function listingOgContent(l: PublicListingDetail): OgContent {
  const qty =
    l.itemSummary.totalQuantity && l.itemSummary.unit
      ? `${l.itemSummary.totalQuantity} ${l.itemSummary.unit}`
      : null;
  const open = l.status === "OPEN";
  return {
    eyebrow: `ALIM TALEBİ · ${l.number}`,
    title: clampTitle(l.title),
    subtitle: joinParts([l.categories[0]?.name, l.company.city], " · ") || null,
    facts: [
      qty ? `Miktar: ${qty}` : null,
      l.itemSummary.count > 1 ? `${l.itemSummary.count} kalem` : null,
      l.closesAt && open ? `Son teklif: ${new Date(l.closesAt).toLocaleDateString("tr-TR")}` : null,
    ].filter((f): f is string => !!f),
    image: l.coverImageUrl ?? null,
    badge: open ? "Teklife açık" : "Kapandı",
  };
}

export function categoryOgContent(name: string, count: number): OgContent {
  return {
    eyebrow: "KATEGORİ",
    title: clampTitle(name),
    subtitle: "Tedarikçi firmaların vitrininden",
    facts: count > 0 ? [`${count.toLocaleString("tr-TR")} ürün`] : [],
    image: null,
    badge: null,
  };
}

export function cityOgContent(kind: "products" | "companies", city: string, count: number): OgContent {
  return {
    eyebrow: "ŞEHİR",
    title: kind === "products" ? `${city} tedarikçileri ve ürünleri` : `${city} firmaları`,
    subtitle: kind === "products" ? "Vitrindeki ürünler, teknik özellik ve fiyatla" : "Tedarikçi ve alıcı dizini",
    facts: count > 0 ? [`${count.toLocaleString("tr-TR")} ${kind === "products" ? "ürün" : "firma"}`] : [],
    image: null,
    badge: null,
  };
}

export const BRAND_OG: OgContent = {
  eyebrow: "B2B TEDARİK PAZAR YERİ",
  title: "Alıcı ve tedarikçiyi tek hesapta birleştiren platform",
  subtitle: "Ürün vitrini · Alım talebi · Kapalı zarf teklif · Sipariş takibi",
  facts: [],
  image: null,
  badge: null,
};
