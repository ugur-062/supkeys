/**
 * ARAMA GÖRÜNÜRLÜĞÜ HAZIRLIĞI — ürün / firma profili / alım talebi (SEO Parça 8).
 *
 * Sayfa şablonu ne kadar iyi olursa olsun tavanı VERİ belirler: "Ürün 1",
 * 100 karakterlik şablon açıklama, tek fotoğraf → arama motoru ve üretken
 * motor için "ince içerik". Bu modül girişteki veriyi arama görünürlüğü
 * gözüyle puanlar ve eksikleri SÖYLER; YAYIN KAPISI DEĞİLDİR
 * (`productPublishBlockers` ve profil/talep kuralları aynen kalır).
 *
 * `product-completion.ts` ile farkı: o "form dolu mu" sorar (her fiyat
 * modu tam puan), bu "arama motoru bu sayfayı neden üste alsın" sorar
 * (uzun ve cümleli açıklama, ≥3 görsel, nitelik tablosu, marka). İkisi
 * bilerek ayrı: birini diğerine katmak ya kapıyı sertleştirir ya da
 * görünürlük sinyalini sulandırırdı.
 *
 * Kural: hiçbir kontrol UYDURMA veri ister. "Fiyat gir" yok — dürüst
 * "teklif isteyin" tam puan (Europages "1,00 €" tuzağı).
 */

export interface SeoCheck {
  key: string;
  label: string;
  /** Eksikse ne yapmalı — tek cümle. */
  hint: string;
  points: number;
  ok: boolean;
}

export interface SeoReadiness {
  /** 0-100 */
  score: number;
  checks: SeoCheck[];
  /** Puan sırasına göre eksikler (en değerlisi önce). */
  missing: SeoCheck[];
  /** Eşik: 70+ "iyi", 40-69 "orta", altı "zayıf" — etiket sözlüğü web'de. */
  level: "weak" | "fair" | "good";
}

export const SEO_GOOD = 70;
export const SEO_FAIR = 40;

/* Metin ölçüleri — cümle sayısı için nokta/ünlem/soru; kısaltmalar (A.Ş.)
   fazladan cümle sayar, tolerans olarak ≥ eşiği kullanılır. */
export function sentenceCount(text: string | null | undefined): number {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return 0;
  // Yalnız NOKTALAMAYLA BİTEN ve en az iki sözcüklü parçalar cümledir;
  // noktasız madde listesi ("- a - b") sıfır sayar.
  const parts = t.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];
  return parts.filter((s) => wordCount(s) >= 2).length;
}

export function wordCount(text: string | null | undefined): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function finish(checks: SeoCheck[]): SeoReadiness {
  const total = checks.reduce((a, c) => a + c.points, 0);
  const got = checks.filter((c) => c.ok).reduce((a, c) => a + c.points, 0);
  const score = total === 0 ? 0 : Math.round((got / total) * 100);
  const missing = checks.filter((c) => !c.ok).sort((a, b) => b.points - a.points);
  return { score, checks, missing, level: score >= SEO_GOOD ? "good" : score >= SEO_FAIR ? "fair" : "weak" };
}

/* ------------------------------------------------------------------ */
/* Ürün                                                                */
/* ------------------------------------------------------------------ */

export interface ProductSeoInput {
  name: string;
  description: string | null;
  images: string[];
  keywords: string[];
  categoryId: string | null;
  /** Doldurulmuş nitelik sayısı (kategori tanımlı). */
  attributeCount: number;
  brand?: string | null;
  mpn?: string | null;
  moq?: unknown | null;
  priceMode?: string | null;
}

export const PRODUCT_SEO_DESCRIPTION = 300;
export const PRODUCT_SEO_IMAGES = 3;
export const PRODUCT_SEO_KEYWORDS = 3;
export const PRODUCT_SEO_ATTRIBUTES = 3;

export function productSeoReadiness(p: ProductSeoInput): SeoReadiness {
  const name = p.name.trim();
  const desc = (p.description ?? "").trim();
  return finish([
    {
      key: "title",
      label: "Açıklayıcı ürün adı (3+ kelime, 20-80 karakter)",
      hint: "Ürün tipi + temel özellik + ölçü/model: \"Paslanmaz çelik dirsek 90° DN50\".",
      points: 15,
      ok: name.length >= 20 && name.length <= 80 && wordCount(name) >= 3,
    },
    {
      key: "description",
      label: `Açıklama en az ${PRODUCT_SEO_DESCRIPTION} karakter`,
      hint: "Ne olduğu, nerede kullanıldığı, malzeme/standart, teslim ve ambalaj — arama motoru ve AI bu metni alıntılar.",
      points: 20,
      ok: desc.length >= PRODUCT_SEO_DESCRIPTION,
    },
    {
      key: "sentences",
      label: "Açıklamada en az 3 cümle",
      hint: "Madde listesi yerine tam cümleler; üretken motorlar cümleyi alıntılar, listeyi değil.",
      points: 10,
      ok: sentenceCount(desc) >= 3,
    },
    {
      key: "images",
      label: `En az ${PRODUCT_SEO_IMAGES} görsel`,
      hint: "Farklı açılar ve kullanım hâli; görsel arama ayrı bir trafik kanalıdır.",
      points: 15,
      ok: p.images.length >= PRODUCT_SEO_IMAGES,
    },
    {
      key: "keywords",
      label: `${PRODUCT_SEO_KEYWORDS}-10 anahtar kelime`,
      hint: "Alıcının yazacağı eş anlamlılar ve jargon (\"telfer\", \"caraskal\").",
      points: 10,
      ok: p.keywords.length >= PRODUCT_SEO_KEYWORDS && p.keywords.length <= 10,
    },
    {
      key: "category",
      label: "Kategori seçili",
      hint: "Kategori sayfası ve eşleştirme bu koddan çalışır.",
      points: 10,
      ok: !!p.categoryId,
    },
    {
      key: "attributes",
      label: `En az ${PRODUCT_SEO_ATTRIBUTES} teknik nitelik`,
      hint: "Nitelik tablosu yapılandırılmış veriye (Product.additionalProperty) girer; süzgeçte bulunursunuz.",
      points: 10,
      ok: p.attributeCount >= PRODUCT_SEO_ATTRIBUTES,
    },
    {
      key: "brand",
      label: "Marka ya da model/parça numarası",
      hint: "Marka ve MPN aramaları en yüksek niyetli aramalardır.",
      points: 5,
      ok: !!(p.brand?.trim() || p.mpn?.trim()),
    },
    {
      key: "commerce",
      label: "Fiyat modu ve minimum sipariş",
      hint: "\"Teklif isteyin\" de tam puandır — boş bırakma, seç.",
      points: 5,
      ok: !!p.priceMode && p.moq != null && p.moq !== "",
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* Firma profili                                                       */
/* ------------------------------------------------------------------ */

export interface CompanySeoReadinessInput {
  aboutText: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  industry: string | null;
  city: string | null;
  website: string | null;
  linkedinUrl?: string | null;
  foundedYear: number | string | null;
  employeeCount: string | null;
  services: string[];
  certifications: string[];
  photos: string[];
  /** Ana + alt kategori toplamı (alıcı+satıcı). */
  categoryCount: number;
  publishedProductCount?: number;
}

export const COMPANY_SEO_ABOUT = 300;

export function companySeoReadiness(c: CompanySeoReadinessInput): SeoReadiness {
  const about = (c.aboutText ?? "").trim();
  return finish([
    {
      key: "about",
      label: `Hakkında en az ${COMPANY_SEO_ABOUT} karakter ve 3 cümle`,
      hint: "Ne üretir/satarsınız, kime, hangi bölgede, kaç yıldır — AI cevaplarında firmanızı bu metinle tanıtır.",
      points: 25,
      ok: about.length >= COMPANY_SEO_ABOUT && sentenceCount(about) >= 3,
    },
    { key: "logo", label: "Logo", hint: "Organization.logo — arama sonucu ve AI kartında görünür.", points: 10, ok: !!c.logoUrl },
    { key: "cover", label: "Kapak görseli", hint: "Paylaşım kartı ve profil başlığı.", points: 5, ok: !!c.coverImageUrl },
    { key: "industry", label: "Sektör", hint: "Başlık şablonuna girer: \"Acme — Makine, İzmir\".", points: 10, ok: !!c.industry?.trim() },
    { key: "city", label: "Şehir", hint: "Şehir sayfalarında listelenmenin şartı.", points: 10, ok: !!c.city?.trim() },
    {
      key: "categories",
      label: "En az 3 kategori (ana + alt)",
      hint: "Organization.knowsAbout ve eşleştirme kategoriden çalışır.",
      points: 10,
      ok: c.categoryCount >= 3,
    },
    {
      key: "website",
      label: "Web sitesi",
      hint: "sameAs: motor Rothern profilini firmanızın gerçek kimliğine bağlar.",
      points: 10,
      ok: /^https?:\/\//i.test((c.website ?? "").trim()),
    },
    { key: "linkedin", label: "LinkedIn", hint: "İkinci sameAs kaynağı.", points: 5, ok: /^https?:\/\//i.test((c.linkedinUrl ?? "").trim()) },
    { key: "founded", label: "Kuruluş yılı", hint: "foundingDate — güven sinyali.", points: 5, ok: !!c.foundedYear },
    { key: "employees", label: "Çalışan sayısı", hint: "numberOfEmployees.", points: 5, ok: !!c.employeeCount },
    { key: "services", label: "En az 3 hizmet", hint: "Hizmet adları arama sözcüğüdür.", points: 5, ok: c.services.length >= 3 },
    {
      key: "products",
      label: "Vitrinde yayında ürün",
      hint: "Ürünsüz profil sayfası tek başına zayıf kalır; ürünler profilin altında indekslenir.",
      points: 0,
      ok: (c.publishedProductCount ?? 0) > 0,
    },
  ].filter((ch) => ch.points > 0 || !ch.ok));
}

/* ------------------------------------------------------------------ */
/* Alım talebi                                                         */
/* ------------------------------------------------------------------ */

export interface ListingSeoReadinessInput {
  title: string;
  description: string | null;
  categoryIds: string[];
  items: { name: string; description?: string | null; quantity?: number | null; unit?: string | null }[];
}

export const LISTING_SEO_DESCRIPTION = 200;

export function listingSeoReadiness(l: ListingSeoReadinessInput): SeoReadiness {
  const title = l.title.trim();
  const desc = (l.description ?? "").trim();
  const items = l.items ?? [];
  return finish([
    {
      key: "title",
      label: "Açıklayıcı başlık (3+ kelime, 20-80 karakter)",
      hint: "\"Malzeme alımı\" değil, \"3/4 inç dikişsiz çelik boru alımı — 1.200 m\".",
      points: 20,
      ok: title.length >= 20 && title.length <= 80 && wordCount(title) >= 3,
    },
    {
      key: "specific",
      label: "Başlıkta ölçü/adet/standart",
      hint: "Sayı ya da standart (DN50, ISO 9001, 400 kVAr) tedarikçinin doğru aramada bulmasını sağlar.",
      points: 10,
      ok: /\d/.test(title),
    },
    {
      key: "description",
      label: `Açıklama en az ${LISTING_SEO_DESCRIPTION} karakter`,
      hint: "Kullanım amacı, teknik şart, teslim yeri/zamanı, belge beklentisi.",
      points: 25,
      ok: desc.length >= LISTING_SEO_DESCRIPTION,
    },
    { key: "category", label: "Kategori seçili", hint: "Eşleştirme ve kategori sayfası.", points: 15, ok: l.categoryIds.length > 0 },
    {
      key: "items",
      label: "Kalemlerde miktar ve birim",
      hint: "Demand.eligibleQuantity — miktar okunabilir olmalı.",
      points: 15,
      ok: items.length > 0 && items.every((it) => (it.quantity ?? 0) > 0 && !!it.unit),
    },
    {
      key: "itemDetail",
      label: "Kalem açıklamaları",
      hint: "Her kalem için malzeme/ölçü/standart bir cümle.",
      points: 15,
      ok: items.length > 0 && items.every((it) => (it.description ?? "").trim().length >= 20),
    },
  ]);
}
