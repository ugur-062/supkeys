/**
 * Teklif kalemi fiyatı — para birimi ve TRY karşılığı (derin denetim Y-14).
 *
 * Madde 9 çok-birimli teklifte kalem, teklifin ANA biriminden farklı bir
 * birimde fiyatlanabilir (`bi.currency`, null = ana birim). Kalemin ana birime
 * çevrim damgası `bi.fxToBase`, teklifin ana birim→TRY damgası
 * `exchangeRateSnapshot`tır. API'deki `itemUnitPriceTry` (common/company/
 * report-currency.ts) ile BİREBİR aynı kural: damgalardan biri yoksa null →
 * kalem kıyas dışı kalır (en ucuz sayılıp ön-seçilmez).
 */

import { isBidExpired } from "@/lib/tenders/bid-expiry";

export interface PricedBid {
  currency?: string | null;
  exchangeRateSnapshot?: string | null;
}

export interface PricedBidItem {
  unitPrice: string | number;
  currency?: string | null;
  fxToBase?: string | number | null;
}

/** Teklifin ana birim→TRY oranı: TRY→1; yabancı ve damgasız→null. */
export function bidRateToTry(bid: PricedBid): number | null {
  if (!bid.currency || bid.currency === "TRY") return 1;
  if (bid.exchangeRateSnapshot == null) return null;
  const n = Number(bid.exchangeRateSnapshot);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Kalemin gösterim birimi: kalem birimi, yoksa teklifin ana birimi. */
export function bidItemCurrency(bid: PricedBid, item: PricedBidItem): string {
  return item.currency || bid.currency || "TRY";
}

/** Kalem birim fiyatının TRY karşılığı; kıyaslanamıyorsa null. */
export function bidItemUnitPriceTry(
  bid: PricedBid,
  item: PricedBidItem,
): number | null {
  const unit = Number(item.unitPrice);
  if (!Number.isFinite(unit)) return null;
  const itemCurrency = bidItemCurrency(bid, item);
  if (itemCurrency === "TRY") return unit;
  const baseToTry = bidRateToTry(bid);
  if (baseToTry == null) return null;
  if (itemCurrency === (bid.currency || "TRY")) return unit * baseToTry;
  const fx = item.fxToBase != null ? Number(item.fxToBase) : null;
  if (fx == null || !Number.isFinite(fx) || fx <= 0) return null;
  return unit * fx * baseToTry;
}

export interface ItemBidOption {
  bidId: string;
  bidderName: string;
  /** Kalemin KENDİ birimindeki birim fiyat (gösterim). */
  price: number;
  /** Kalemin birimi (gösterim). */
  currency: string;
  /** TRY karşılığı (kıyas); null = kur/damga yok, kıyaslanamaz. */
  priceTry: number | null;
}

/**
 * Bir kalemi fiyatlamış, KAZANDIRILABİLİR (SUBMITTED ∧ geçerliliği dolmamış)
 * teklifler — TRY karşılığına göre artan (en iyi önde → kalem kazandırmada
 * ön-seçilen). Kıyaslanamayan (null) satırlar listenin SONUNA gider,
 * ön-seçilmez. Geçerliliği dolmuş teklif HİÇ girmez (arayüz testi O-090):
 * sunucu kazandırmada 400 verir, ön-seçilmesi bütün kalem kazandırmasını
 * düşürüyordu.
 */
export function rankBidsForItem<
  B extends PricedBid & {
    id: string;
    bidderName: string;
    status: string;
    submittedAt?: string | null;
    validityDays?: number | null;
    items?: (PricedBidItem & { itemId: string })[];
  },
>(bids: readonly B[], itemId: string, now: number = Date.now()): ItemBidOption[] {
  return bids
    .filter((b) => b.status === "SUBMITTED" && !isBidExpired(b, now))
    .flatMap((b) => {
      const bi = b.items?.find((x) => x.itemId === itemId);
      const price = bi ? Number(bi.unitPrice) : 0;
      if (!bi || !(price > 0)) return [];
      return [
        {
          bidId: b.id,
          bidderName: b.bidderName,
          price,
          currency: bidItemCurrency(b, bi),
          priceTry: bidItemUnitPriceTry(b, bi),
        },
      ];
    })
    .sort(
      (a, b) =>
        (a.priceTry ?? Number.MAX_SAFE_INTEGER) -
        (b.priceTry ?? Number.MAX_SAFE_INTEGER),
    );
}
