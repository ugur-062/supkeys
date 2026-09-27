import { isCurrencyCode, type CurrencyCode } from "@rothern/shared";
import { convertAmount, resolveCompanyCurrency } from "../currency/fx-rates";

/**
 * Rapor/pano KALEM hesaplarında TEK BAZ (denetim 2026-08-25 Parça 8, HIGH).
 *
 * Sorun: teklif TOPLAMLARI `bidTry()` ile TRY'ye çevriliyordu ama KALEM
 * satırları ham okunuyordu — hedef/taban birim fiyatı İLANIN biriminde,
 * kazanan birim fiyatı ise TEKLİFİN (hatta kalemin) biriminde. İkisi
 * çevrilmeden çıkarılınca uydurma tasarruf ve YANLIŞ "önerilen kazanan"
 * çıkıyordu (ör. TRY ilan + 30 USD/adet kazanan → rapor "₺97.000 tasarruf"
 * derken gerçekte ₺20.000 aşım vardı).
 *
 * Kural (INV-FX-1 ile aynı): karar/kıyas TRY bazında yapılır; kur damgası
 * yoksa değer `null` döner ve o satır hesaba KATILMAZ (fail-closed —
 * "0 TL kazanan" gibi uydurma tasarruf üretmez).
 */

/** Teklifin (ya da kalemin) TRY'ye çevrim çarpanı; damga yoksa null. */
export function bidRateToTry(bid: {
  currency: string;
  exchangeRateSnapshot: unknown | null;
}): number | null {
  if (bid.currency === "TRY") return 1;
  const snap = bid.exchangeRateSnapshot;
  if (snap == null) return null;
  const n = Number(snap);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Kalem birim fiyatının TRY karşılığı. Kalem kendi para biriminde olabilir
 * (madde 9 çok-birimli teklif): `fxToBase` kalem→teklif ana birimi damgasıdır,
 * teklifin damgası da ana birim→TRY. İkisinden biri yoksa null.
 */
export function itemUnitPriceTry(
  bid: { currency: string; exchangeRateSnapshot: unknown | null },
  item: { unitPrice: unknown; currency?: string | null; fxToBase?: unknown },
): number | null {
  const baseToTry = bidRateToTry(bid);
  if (baseToTry == null) return null;
  const unit = Number(item.unitPrice);
  if (!Number.isFinite(unit)) return null;
  const itemCurrency = item.currency ?? bid.currency;
  if (itemCurrency === bid.currency) return unit * baseToTry;
  if (itemCurrency === "TRY") return unit;
  const fx = item.fxToBase != null ? Number(item.fxToBase) : null;
  if (fx == null || !Number.isFinite(fx) || fx <= 0) return null;
  return unit * fx * baseToTry;
}

/**
 * İLANIN birimindeki referans (hedef fiyat / taban) değerinin TRY karşılığı.
 * İlan birimi TRY değilse ve elde bir kur yoksa null (kıyas yapılmaz).
 */
export function listingAmountTry(
  primaryCurrency: string,
  value: unknown,
  rateForListingCurrency: number | null,
): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (primaryCurrency === "TRY") return n;
  if (rateForListingCurrency == null || rateForListingCurrency <= 0) return null;
  return n * rateForListingCurrency;
}

/**
 * İlan biriminin TRY kuru — ilan birimini kullanan kazanan teklifin DAMGASINDAN
 * (Tasarruf sekmesi ile pano aynı kural). TRY ilanda 1; damga yoksa null →
 * hedef fiyat kıyası yapılmaz (uydurma tasarruf yok).
 */
export function listingRateToTry(l: {
  primaryCurrency: string;
  bids: { currency: string; exchangeRateSnapshot: unknown | null }[];
}): number | null {
  if (l.primaryCurrency === "TRY") return 1;
  for (const b of l.bids) {
    if (b.currency !== l.primaryCurrency) continue;
    const r = bidRateToTry(b);
    if (r != null) return r;
  }
  return null;
}

/**
 * FİRMANIN RAPOR PARA BİRİMİ (2026-09-27, uluslararası tur): pano ve rapor
 * tutarları bu birimde gösterilir. Talep Şartları'ndaki ana para birimi, yoksa
 * firmanın ülkesinin birimi (`defaultCurrencyForCountry`). Eskiden taban hep
 * TRY idi ve TRY dışı sipariş/talepler panodan DIŞLANIYORDU — yalnız EUR
 * satan Alman satıcı sıfır gelir görüyordu.
 */
export function reportCurrencyOf(company: { country?: string | null; requestDefaults?: unknown } | null | undefined): CurrencyCode {
  const rd = company?.requestDefaults as { primaryCurrency?: unknown } | null | undefined;
  if (rd && isCurrencyCode(rd.primaryCurrency)) return rd.primaryCurrency;
  return resolveCompanyCurrency(null, company?.country);
}

/**
 * TRY karşılığı → rapor birimi (güncel TCMB kuru, bellek tablosu). Kur yoksa
 * null. Kaynak tutarın kendi biriminden çevirmek için `convertAmount`.
 */
export function tryToCurrency(amountTry: number, currency: string): number | null {
  return convertAmount(amountTry, "TRY", currency);
}
