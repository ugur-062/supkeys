/**
 * GÖRÜNÜRLÜK KATMANI v2 — herkese açık yüzeyde kim neyi görür (2026-09-04,
 * Europages kalıbı; önceki tabloyu değiştirir).
 *
 * İLKE: ürün ve firma TAMAMEN açık ve gezilebilir (vitrin fiyatıyla
 * vitrindir); alım talebi GİZLİ ama cezbedici (ölçek görünür, kimlik ve
 * içerik üyeye). Herkese açık sayfalar statik/ISR ve oturum tanımaz: burada
 * `viewer` HER ZAMAN `anon`; üye katmanı PANELDE yaşar, tablo onu belgeler
 * ve `GatedField` bağlantısını nereye atacağımızı söyler.
 *
 * Gizlenen alan HTML'e HİÇ yazılmaz: API projeksiyonu döndürmez, bileşen
 * `null` bile geçmez (anahtar adı RSC yüküne düşer).
 */
export type Viewer = "anon" | "member" | "connected" | "premium";

const RANK: Record<Viewer, number> = { anon: 0, member: 1, connected: 2, premium: 3 };

/** Alanı görmek için gereken EN DÜŞÜK katman; `never` = herkese açık yüzeyde asla. */
export const VISIBILITY = {
  product: {
    gallery: "anon",
    name: "anon",
    category: "anon",
    price: "anon", // fiyat / aralık / "teklif isteyin"
    moq: "anon",
    features: "anon",
    attributes: "anon",
    description: "anon",
    documents: "anon", // ad + boyut; indirme üyeye
    documentDownload: "member",
    companyIdentity: "anon", // ad + logo + Doğrulanmış + faaliyet + şehir
    moreFromCompany: "anon",
    similar: "anon",
    inquiry: "member", // "Bilgi iste" formu
    companyWebsite: "member",
  },
  company: {
    identity: "anon", // logo, kapak, ad, rozetler, şehir, faaliyet, kategoriler
    about: "anon",
    services: "anon",
    certifications: "anon",
    gallery: "anon",
    products: "anon",
    foundedYear: "anon",
    employeeCount: "anon",
    ratingAvg: "anon",
    rothernId: "member",
    contact: "member", // web/sosyal/telefon/e-posta + bağlantı isteği
    ratingDistribution: "member",
    orderCounts: "member",
    reviewTexts: "member",
    listings: "member", // açık talep/ilan listesi
  },
  directory: {
    list: "anon", // koşul: publicEnabled ∧ (≥1 ürün ∨ tamlık ≥ %60)
    rothernId: "member",
    contact: "member",
  },
  listing: {
    title: "anon",
    category: "anon",
    scope: "anon",
    itemSummary: "anon", // "2 kalem · 1.200 adet"
    itemQuantities: "anon", // "Kalem 1 · 500 adet" — ad yok
    buyerCity: "anon",
    buyerActivity: "anon",
    verifiedBadge: "anon",
    closesAt: "anon",
    format: "anon", // kapalı zarf
    buyerName: "member",
    itemNames: "member",
    specification: "member",
    files: "member",
    targetPrice: "never",
    bid: "member", // ayrıca SILVER+/KYC panel kapıları
    buyerOtherListings: "member",
  },
} as const;

export type Entity = keyof typeof VISIBILITY;
export type FieldOf<E extends Entity> = keyof (typeof VISIBILITY)[E];

export function canSee<E extends Entity>(viewer: Viewer, entity: E, field: FieldOf<E>): boolean {
  const need = VISIBILITY[entity][field] as Viewer | "never";
  if (need === "never") return false;
  return RANK[viewer] >= RANK[need];
}

/** Yalnız site içi yol; açık yönlendirme yok. */
export function safeRedirect(redirect?: string | null): string | null {
  return redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : null;
}

/** Giriş bağlantısı — giriş sayfası `?next=` okur. */
export function loginHref(redirect?: string): string {
  const safe = safeRedirect(redirect);
  return safe ? `/company/login?next=${encodeURIComponent(safe)}` : "/company/login";
}

/** Kayıt bağlantısı — niyet + geri dönüş (`signup-intent.ts` okur). */
export function signupHref(intent?: string, redirect?: string): string {
  const sp = new URLSearchParams();
  if (intent) sp.set("intent", intent);
  const safe = safeRedirect(redirect);
  if (safe) sp.set("redirect", safe);
  const s = sp.toString();
  return s ? `/company/kayit?${s}` : "/company/kayit";
}

/** Panel karşılıkları — GatedField hedefleri buradan. */
export const PANEL_TARGET = {
  product: (companySlug: string, productSlug: string) =>
    `/company/satinalma/urunler/${companySlug}/${productSlug}`,
  company: (companySlug: string) => `/company/firma/${companySlug}`,
  /** Panel talep sayfası cuid ister; numarayla açık talepler listesinde aranır. */
  listing: (number: string) =>
    `/company/satis?q=${encodeURIComponent(number)}#acik-talepler`,
  directory: "/company/satinalma/tedarikcilerim",
} as const;
