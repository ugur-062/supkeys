import { PAYMENT_CATEGORIES, REQUEST_DEFAULTS_FALLBACK, visibleCategoryIds, type RequestDefaults } from "@rothern/shared";
import { toLocalInput } from "./map-detail-to-form";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "./form-schema";

/**
 * TALEP ŞARTLARI ↔ FORM köprüsü (2026-09-09, hızlı talep).
 *
 * `applyRequestDefaults`: profil → form (hızlı kart ve sihirbaz varsayılanı).
 * `defaultsFromForm`: form → profil ("bu şartları varsayılan yap").
 * İkisi de AYNI alan listesini gezer; biri eklenip diğeri unutulursa profil
 * sessizce eksik kalır — testte gidiş-dönüş eşitliği kilitli.
 *
 * 2026-09-21: yurtiçi/uluslararası kapsamı kalktı — teslim şekli ve ödeme
 * şekli ülkeye göre SÜZÜLMEZ; görünürlük `targetCountries` (boş = herkes).
 */

/** Tüm teslim şekilleri tek listede (yurtiçi merdiveni + Incoterm'ler). */
export function deliveryTermsFor(all: readonly string[]): string[] {
  return [...all];
}

export function paymentCategoriesFor(): string[] {
  return [...PAYMENT_CATEGORIES];
}

/** Kapanış = şimdi + N gün, yerel `datetime-local` biçiminde (form alanı). */
export function closesAtFromDays(days: number, now = new Date()): string {
  const d = new Date(now.getTime() + days * 86_400_000);
  // Saati gün sonuna değil, aynı saate koyar; kullanıcı ileri alabilir.
  return toLocalInput(d.toISOString());
}

export function applyRequestDefaults(base: TenderFormData, d: RequestDefaults | null, now = new Date()): TenderFormData {
  const r = d ?? REQUEST_DEFAULTS_FALLBACK;
  return {
    ...base,
    targetCountries: r.targetCountries ?? [],
    visibility: r.visibility as TenderFormData["visibility"],
    deliveryTerm: (r.deliveryTerm ?? undefined) as TenderFormData["deliveryTerm"],
    paymentCategory: r.paymentCategory as TenderFormData["paymentCategory"],
    paymentDays: r.paymentDays ?? undefined,
    advancePercent: r.advancePercent ?? undefined,
    lcType: (r.lcType ?? undefined) as TenderFormData["lcType"],
    primaryCurrency: r.primaryCurrency as TenderFormData["primaryCurrency"],
    allowedCurrencies: r.allowedCurrencies as TenderFormData["allowedCurrencies"],
    bidVisibility: r.bidVisibility as TenderFormData["bidVisibility"],
    requireAllItems: r.requireAllItems,
    requireBidDocument: r.requireBidDocument,
    bidsCloseAt: closesAtFromDays(r.closeDays, now),
    deliveryAddressId: r.deliveryAddressId ?? base.deliveryAddressId ?? "",
    billingSameAsDelivery: r.billingSameAsDelivery,
  };
}

/**
 * Hızlı kartın AÇILIŞ değerleri — tohumun türüne göre (derin denetim Y-19).
 *
 * - `blank`: boş kart / AI belge / ürün tohumu — şartlar profilden
 *   (`applyRequestDefaults`); bu tohumlar ticari şart TAŞIMAZ.
 * - `edit`: mevcut talebin kendi değerleri AYNEN (görünürlük, para birimi,
 *   ödeme, kapanış…). Profil varsayılanı UYGULANMAZ — eskiden uygulanıyordu ve
 *   yalnız başlığı düzeltilen özel/USD/akreditifli talep kaydedilince herkese
 *   açık/TRY/açık hesap oluyor, kapanışı bugün+N güne kayıyordu.
 * - `seed`: kopya (`?from=`) ve şablon (`?template=`) — tohumun şartları
 *   korunur; tohumda HİÇ OLMAYAN alan (eski/kısmi şablon) profilden dolar.
 *   Kapanış ve teslim adresi tohumda boşsa profilden. Ödeme alanları grup:
 *   tohum ödeme şeklini taşıyorsa vade/peşin/akreditif de tohumdan gelir
 *   (profilin vadesi başka bir ödeme şekline karışmasın).
 */
export type QuickSeedKind = "blank" | "edit" | "seed";

/**
 * FORMA GİRİŞTE GİZLİ KATEGORİ DÜŞER (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori talepte de gösterilmesin"). Tohum nereden gelirse gelsin
 * (düzenleme, kopya, şablon, ürün, AI taslağı, oturum taslağı) gizli segmentin
 * altındaki kod çip olarak çizilmez ve yeni talebe ön-seçili gelmez; görünür
 * kategorisi kalmayan formda şemanın "kategori zorunlu" kuralı güncel bir
 * kategori ister. Eşleyiciler (`mapDetailToForm`, `mapProductToForm`) aynı
 * süzgeci uygular; burası tek geçiş noktası (şablon yükü eşleyiciden geçmez).
 *
 * İSTİSNA — YAYINDAKİ talebin düzenlemesi: kategorisiz açılan formda kategori
 * zorunlu DEĞİLDİR (`QuickRequest` `categoryOptional`, şema `categoryRequired:
 * false`). Değişmeyen eski değer ilgisiz bir düzenlemeyi engellemez; taslağın
 * yayını ve yeni talep kategori ister.
 */
export function withVisibleCategories<T extends { categoryIds?: string[] }>(values: T): T {
  if (!values.categoryIds) return values;
  const visible = visibleCategoryIds(values.categoryIds);
  return visible.length === values.categoryIds.length ? values : { ...values, categoryIds: visible };
}

const PAYMENT_DETAIL_KEYS = ["paymentDays", "advancePercent", "lcType"] as const;

export function initialRequestFormValues(
  kind: QuickSeedKind,
  seed: Partial<TenderFormData> | undefined,
  d: RequestDefaults | null,
  now = new Date(),
): TenderFormData {
  if (kind === "edit") return withVisibleCategories({ ...DEFAULT_FORM_VALUES, ...seed });
  const withDefaults = withVisibleCategories(applyRequestDefaults({ ...DEFAULT_FORM_VALUES, ...seed }, d, now));
  if (kind === "blank" || !seed) return withDefaults;
  const out: TenderFormData = withVisibleCategories({ ...withDefaults, ...seed });
  if ("paymentCategory" in seed) {
    for (const k of PAYMENT_DETAIL_KEYS) (out as Record<string, unknown>)[k] = seed[k];
  }
  out.bidsCloseAt = seed.bidsCloseAt || withDefaults.bidsCloseAt;
  out.deliveryAddressId = seed.deliveryAddressId || withDefaults.deliveryAddressId;
  return out;
}

/**
 * Bağlantısız firmada PLATFORM varsayılanı (D-246, 2026-10-01): "Bağlantılarım"
 * talebi kimseye göstermez → "Herkese açık". Yalnız platform varsayılanına
 * (kayıtlı şart / son talep YOK) uygulanır; kayıtlı şart değiştirilmez.
 */
export function fallbackVisibilityFor(visibility: string, connectionCount: number): string {
  return visibility === "CONNECTIONS" && connectionCount === 0 ? "PUBLIC" : visibility;
}

/**
 * Profile yazılmadan önce son normalleştirme: RFQ her zaman kapalı zarf (T-16).
 * Sunucudan gelen profil (kayıtlı ya da son talepten türetilmiş) eski `false`
 * değerini taşıyabilir; UI bu alanı hiçbir yoldan geri yazmaz.
 */
export function normalizeRequestDefaults(input: RequestDefaults): RequestDefaults {
  return { ...input, isSealedBid: true };
}

export function defaultsFromForm(f: TenderFormData, closeDays: number): RequestDefaults {
  return {
    targetCountries: f.targetCountries ?? [],
    visibility: f.visibility,
    deliveryTerm: f.deliveryTerm ?? null,
    paymentCategory: f.paymentCategory,
    paymentDays: f.paymentDays ?? null,
    advancePercent: f.advancePercent ?? null,
    lcType: f.lcType ?? null,
    primaryCurrency: f.primaryCurrency,
    allowedCurrencies: f.allowedCurrencies,
    // RFQ her zaman kapalı zarf (T-16) — profil sözleşmesi alanı taşır, form değil.
    isSealedBid: true,
    bidVisibility: f.bidVisibility,
    requireAllItems: f.requireAllItems,
    requireBidDocument: f.requireBidDocument,
    closeDays,
    deliveryAddressId: f.deliveryAddressId || null,
    billingSameAsDelivery: f.billingSameAsDelivery,
  };
}
