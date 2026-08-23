import { Prisma } from "@rothern/db";

/**
 * "Fiyatlı kalem" = `unitPrice > 0` — TEK KAYNAK (S1 drift önleme). Kapalı-zarf
 * kapsam/sıralama tarafı (owner currentBest + public bestTotal), monotonluk
 * kıyası ve AWARDED_PARTIAL damgası HEP aynı tanımı kullanmalı; aksi halde
 * 0-fiyatlı satır içeren "tam" bir teklif bir yolda tam, diğerinde kısmi
 * sayılır (eskiden filtresiz `_count._all` → tam kazanan yanlışlıkla
 * AWARDED_PARTIAL damgalanıyordu).
 *
 * Prisma `where` fragment olarak paylaşılır (JS predicate değil) — her
 * `listingBidItem` sorgusuna spread edilir: `where: { ...PRICED_ITEM_WHERE }`
 * veya başka koşullarla birlikte `where: { bidId: {...}, ...PRICED_ITEM_WHERE }`.
 */
export const PRICED_ITEM_WHERE = {
  unitPrice: { gt: 0 },
} as const satisfies Prisma.ListingBidItemWhereInput;

/**
 * S2 — "tam kapsam" teklif kıyas filtresi — TEK KAYNAK. Kalemli ilanda
 * sıralamaya (owner currentBest + public bestTotal) yalnız TÜM kalemleri
 * fiyatlamış teklifler girer; kısmi teklifin düşük toplamı "en iyi" değildir
 * (elma-armut). Kalemsiz ilan (count 0) → herkes kıyaslanabilir.
 * (`bidItemCount` = fiyatlı kalem sayısı = PRICED_ITEM_WHERE ile sayılan.)
 * NOT: sıralamanın kendisi (FX-normalize + tie-break) `rankAuctionBids` servis
 * metodudur (this.auctionTryValue'ye bağlı, impure → serviste kalır); burada
 * yalnız kapsam predicate'i paylaşılır.
 */
export function bidCoversAllItems(
  bidItemCount: number,
  listingItemCount: number,
): boolean {
  return listingItemCount === 0 || bidItemCount >= listingItemCount;
}

type PriceQty = {
  unitPrice: Prisma.Decimal | string | number;
  quantity: Prisma.Decimal | string | number;
};

/**
 * S5 — tek kalem satır toplamı `unitPrice × quantity` (Decimal). Teklif/sipariş
 * tutarının atom büyüklüğü — TEK KAYNAK.
 */
export function lineTotal(
  unitPrice: Prisma.Decimal | string | number,
  quantity: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return new Prisma.Decimal(unitPrice).mul(quantity);
}

/**
 * S5 — kalem satırları toplamı `Σ(unitPrice × quantity)` (Decimal) — TEK KAYNAK.
 * placeBid `bid.amount`'u (miktar HER ZAMAN listing'den; teklif DTO'sunda
 * quantity yok) VE buildItemGroups grup tutarı bu magnitude'u hesaplar; ayrıca
 * runFullAward `bid.amount`'u bununla YENİDEN hesaplayıp eşitlik NÖBETÇİSİ tutar
 * (invariant kırılırsa — ör. bidCount kilidi statü-filtreli olursa listing
 * miktarı bid sonrası değişebilir — award fail-closed olur, sessiz para
 * ıraksaması DEĞİL).
 */
export function sumLineTotals(lines: readonly PriceQty[]): Prisma.Decimal {
  return roundMoney(
    lines.reduce(
      (sum, l) => sum.plus(lineTotal(l.unitPrice, l.quantity)),
      new Prisma.Decimal(0),
    ),
  );
}

/**
 * Para yuvarlaması — `Decimal(18,2)` kolonlarının DAVRANIŞIYLA birebir
 * (ROUND_HALF_UP, 2 basamak; INV-MONEY-1). Toplam tutarların yazılmadan ÖNCE
 * bundan geçmesi şart: aksi hâlde `10.33 × 1.5 = 15.495` hesaplanıp DB'ye
 * `15.50` yazılıyor ve aynı formülü yeniden koşan S5 nöbetçisi
 * `15.495 ≠ 15.50` görüp kazandırmayı KALICI olarak durduruyordu (kesirli
 * miktarlı ilanlarda toplu kazandırma ölüydü — denetim 2026-08-23).
 */
export function roundMoney(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

type PriceQtyFx = PriceQty & {
  /** Kalem birimi → teklifin ana birimi çevrim damgası; null/1 = aynı birim. */
  fxToBase?: Prisma.Decimal | string | number | null;
};

/**
 * S5 (çok-birimli, madde 9) — kalem satırlarının ANA BİRİME çevrilmiş toplamı.
 * TÜM satırlar ana birimdeyse (fx yok/1) klasik `sumLineTotals` ile BİREBİR —
 * legacy tek-birim yolun sayısal davranışı değişmez. Karışık birimde her satır
 * kayıtlı damgayla çevrilip 2 basamağa yuvarlanır (ROUND_HALF_UP), sonra
 * toplanır. placeBid `bid.amount`'u ve runFullAward nöbetçisi AYNI formülü
 * (kayıtlı fxToBase ile) kullanır → determinizm, sessiz para ıraksaması yok.
 */
export function sumLineTotalsInBase(
  lines: readonly PriceQtyFx[],
): Prisma.Decimal {
  const mixed = lines.some(
    (l) => l.fxToBase != null && !new Prisma.Decimal(l.fxToBase).equals(1),
  );
  if (!mixed) return sumLineTotals(lines);
  return roundMoney(
    lines.reduce((sum, l) => {
      const fx =
        l.fxToBase != null
          ? new Prisma.Decimal(l.fxToBase)
          : new Prisma.Decimal(1);
      return sum.plus(
        lineTotal(l.unitPrice, l.quantity)
          .mul(fx)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      );
    }, new Prisma.Decimal(0)),
  );
}
