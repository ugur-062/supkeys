/**
 * GÖRÜNÜRLÜK KATMANI — herkese açık yüzeyde kim neyi görür (2026-09-04).
 *
 * TEK KAYNAK. Herkese açık sayfalar statik/ISR üretilir ve oturum tanımaz:
 * bu sayfalarda `viewer` HER ZAMAN `anon`. Üye/bağlantılı/premium katmanları
 * PANELDE yaşar (`/company/...`); buradaki tablo o katmanların panelde bugün
 * ne gördüğünü belgeler ve `GatedField` bağlantısını nereye atacağımızı
 * söyler — "giriş yapın" demek yetmez, giriş SONRASI doğru sayfaya düşmeli.
 *
 * İlkeler:
 *   · ilan sahibi HİÇBİR katmanda herkese açık sayfaya yazılmaz (kapalı zarf
 *     + anonim sahip, `PUBLIC_LISTING_SELECT`); "never" = panelde bile
 *     yalnız davetli/bağlantılı görür,
 *   · ürün firmanın opt-in vitrini → firma adı anonimde de görünür,
 *   · rakip analizi değeri taşıyan her sayı (fiyat, MOQ, puan, kuruluş,
 *     çalışan, Rothern ID, sipariş sayıları) giriş arkasında,
 *   · SEO'ya yeten kimlik (ad, şehir, kategori, görsel) açık.
 *
 * Gizlenen alan HTML'e HİÇ yazılmaz (CSS ile gizleme yok): API projeksiyonu
 * o alanı döndürmez, bileşen yerine `GatedField` basar.
 */
export type Viewer = "anon" | "member" | "connected" | "premium";

const RANK: Record<Viewer, number> = { anon: 0, member: 1, connected: 2, premium: 3 };

/** Alanı görmek için gereken EN DÜŞÜK katman; `never` = herkese açık yüzeyde asla. */
export const VISIBILITY = {
  listing: {
    title: "anon",
    category: "anon",
    scope: "anon", // yurtiçi/uluslararası + kalem SAYISI + ilk 3 kalem adı
    closesAt: "anon",
    city: "anon",
    description: "anon", // sayfanın içeriği; onsuz ince içerik
    itemList: "member", // miktar/marka/şartname
    files: "member",
    buyNowPrice: "member",
    ownerName: "never",
    bid: "premium", // BRONZ+ ve KYC — panel kapıları
  },
  product: {
    image: "anon",
    name: "anon",
    category: "anon",
    description: "anon",
    companyName: "anon", // opt-in vitrin
    price: "member",
    moq: "member",
    inquiry: "member",
  },
  company: {
    name: "anon",
    city: "anon",
    activities: "anon",
    categories: "anon",
    productImages: "anon",
    aboutExcerpt: "anon", // ilk 2 satır
    aboutFull: "member",
    services: "member",
    certifications: "member",
    contact: "connected", // web sitesi / sosyal / iletişim
    rothernId: "connected",
    foundedYear: "connected",
    employeeCount: "connected",
    ratingAvg: "member",
    ratingDistribution: "connected",
    orderCounts: "connected",
  },
  directory: {
    summary: "anon", // "N doğrulanmış firma · en çok temsil edilen kategoriler"
    list: "member",
  },
} as const;

export type Entity = keyof typeof VISIBILITY;
export type FieldOf<E extends Entity> = keyof (typeof VISIBILITY)[E];

export function canSee<E extends Entity>(
  viewer: Viewer,
  entity: E,
  field: FieldOf<E>,
): boolean {
  const need = VISIBILITY[entity][field] as Viewer | "never";
  if (need === "never") return false;
  return RANK[viewer] >= RANK[need];
}

/**
 * Giriş bağlantısı — giriş sonrası ziyaretçi geldiği kaydın PANEL
 * karşılığına düşer. Yalnız site içi yol kabul edilir (açık yönlendirme yok).
 */
export function loginHref(redirect?: string): string {
  const safe = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : null;
  return safe ? `/company/login?redirect=${encodeURIComponent(safe)}` : "/company/login";
}

/** Panel karşılıkları — GatedField hedefleri buradan. */
export const PANEL_TARGET = {
  product: (companySlug: string, productSlug: string) =>
    `/company/satinalma/urunler/${companySlug}/${productSlug}`,
  company: (companySlug: string) => `/company/firma/${companySlug}`,
  /** Panel ilan sayfası cuid ister; numarayla açık talepler listesinde aranır. */
  listing: (type: "ALIM" | "SATIS", number: string) =>
    type === "ALIM"
      ? `/company/satis/acik-talepler?q=${encodeURIComponent(number)}`
      : `/company/satinalma/urunler?q=${encodeURIComponent(number)}`,
  directory: "/company/satinalma/tedarikcilerim",
} as const;
