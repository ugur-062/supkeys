/**
 * TALEP ŞARTLARI — firmanın ticari profili (2026-09-09, hızlı talep).
 *
 * Talep = niyet + ticari şartlar. Niyet her seferinde yeni (kalemler, adres,
 * süre, kime); şartlar neredeyse hiç değişmez. Bu tip şartların tek yerde
 * saklanan hâlidir: hızlı talep kartı bunlarla başlar, sihirbaz varsayılanı
 * bunlardan alır. Doğrulama API'de (`requestDefaultsSchema`, Prisma
 * enum'larıyla); burada yalnız sözleşme tipi.
 */
export interface RequestDefaults {
  isInternational: boolean;
  /** PRIVATE | CONNECTIONS | PUBLIC */
  visibility: string;
  /** ListingDeliveryTerm ya da null (kapsama göre listeden seçilir). */
  deliveryTerm: string | null;
  /** ListingPaymentCategory */
  paymentCategory: string;
  paymentDays: number | null;
  advancePercent: number | null;
  lcType: string | null;
  primaryCurrency: string;
  allowedCurrencies: string[];
  isSealedBid: boolean;
  /** ListingBidVisibility */
  bidVisibility: string;
  requireAllItems: boolean;
  requireBidDocument: boolean;
  /** Teklif toplama süresi (gün) — kapanış = yayın + closeDays. */
  closeDays: number;
  deliveryAddressId: string | null;
  billingSameAsDelivery: boolean;
}

/** Hızlı talep süre çipleri (gün). Varsayılan 7. */
export const REQUEST_CLOSE_DAY_OPTIONS = [3, 7, 14] as const;
export const REQUEST_CLOSE_DAYS_DEFAULT = 7;
export const REQUEST_CLOSE_DAYS_MAX = 60;

export type RequestDefaultsSource = "saved" | "last_listing" | "none";

export interface RequestDefaultsResponse {
  defaults: RequestDefaults | null;
  source: RequestDefaultsSource;
}

/** Platform varsayılanı — profil de son talep de yoksa (yurtiçi, kapalı zarf, TRY). */
export const REQUEST_DEFAULTS_FALLBACK: RequestDefaults = {
  isInternational: false,
  visibility: "CONNECTIONS",
  deliveryTerm: null,
  paymentCategory: "OPEN_ACCOUNT",
  paymentDays: null,
  advancePercent: null,
  lcType: null,
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  isSealedBid: true,
  bidVisibility: "OWN_RANK",
  requireAllItems: false,
  requireBidDocument: false,
  closeDays: REQUEST_CLOSE_DAYS_DEFAULT,
  deliveryAddressId: null,
  billingSameAsDelivery: true,
};

/** Yayın → kapanış arasından gün sayısı (1..MAX), hesaplanamazsa varsayılan. */
export function closeDaysBetween(publishedAt: Date | string | null | undefined, closesAt: Date | string | null | undefined): number {
  if (!publishedAt || !closesAt) return REQUEST_CLOSE_DAYS_DEFAULT;
  const ms = new Date(closesAt).getTime() - new Date(publishedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return REQUEST_CLOSE_DAYS_DEFAULT;
  return Math.min(REQUEST_CLOSE_DAYS_MAX, Math.max(1, Math.round(ms / 86_400_000)));
}
