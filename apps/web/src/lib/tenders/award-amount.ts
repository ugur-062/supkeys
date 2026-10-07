/**
 * Kazandırma onayında gösterilen tutar (kullanıcı kararı 2026-10-07).
 *
 * Kazandırma geri alınamaz; onay penceresi firma adının yanında kazandırılan
 * TUTARI da söyler. Tutar teklif satırının bastığı değerlerden gelir: teklifin
 * kendi birimindeki toplam ve (yabancı birimde, sunucu verdiyse) `amountTry`.
 * İstemcide kur çevrimi YAPILMAZ.
 */
import { lineAmount } from "@/lib/line-amount";

type Money = (value: number | string, currency?: string | null) => string;

export interface AwardAmountBid {
  amount: number | string;
  currency?: string | null;
  amountTry?: number | string | null;
}

/**
 * Toplu kazandırmada tutar metni: teklif satırıyla aynı biçimleyici. Yabancı
 * birimli teklifte sunucunun verdiği TRY karşılığı varsa `withTry` ile eklenir.
 */
export function awardAmountLabel(
  bid: AwardAmountBid,
  money: Money,
  withTry: (amount: string, amountTry: string) => string,
): string {
  const amount = money(bid.amount, bid.currency ?? "TRY");
  if (bid.currency && bid.currency !== "TRY" && bid.amountTry != null && bid.amountTry !== "") {
    return withTry(amount, money(bid.amountTry, "TRY"));
  }
  return amount;
}

export interface ItemAwardSelection {
  /** Kazandırılan miktar (kısmi miktar girildiyse o, yoksa kalem miktarı). */
  quantity: number;
  /** Kalemin KENDİ birimindeki birim fiyat (seçicide gösterilen). */
  unitPrice: number;
  currency: string;
  bidId: string;
  bidderName: string;
}

export interface ItemAwardGroup {
  bidId: string;
  bidderName: string;
  currency: string;
  amount: number;
}

/**
 * Kalem bazlı kazandırmada firma + para birimi başına tutar (sunucu da siparişi
 * firma + birim başına açar). Satır tutarı `lineAmount` ile kuruşa yuvarlanır;
 * birimler arası çevrim/toplam yapılmaz.
 */
export function itemAwardGroups(selections: readonly ItemAwardSelection[]): ItemAwardGroup[] {
  const groups = new Map<string, ItemAwardGroup & { cents: number }>();
  for (const s of selections) {
    const key = `${s.bidId}|${s.currency}`;
    const cents = Math.round(lineAmount(s.quantity, s.unitPrice) * 100);
    const g = groups.get(key);
    if (g) g.cents += cents;
    else
      groups.set(key, {
        bidId: s.bidId,
        bidderName: s.bidderName,
        currency: s.currency,
        amount: 0,
        cents,
      });
  }
  return [...groups.values()].map(({ cents, ...g }) => ({ ...g, amount: cents / 100 }));
}

/**
 * Grupların tek satırlık dökümü ("Firma A: 800,00 ₺; Firma B: $120.00") ve —
 * hepsi aynı birimdeyse ve birden çok grup varsa — genel toplam.
 */
export function itemAwardSummary(
  groups: readonly ItemAwardGroup[],
  money: Money,
  line: (bidderName: string, amount: string) => string,
): { breakdown: string; total: string | null } {
  const breakdown = groups.map((g) => line(g.bidderName, money(g.amount, g.currency))).join("; ");
  const currencies = new Set(groups.map((g) => g.currency));
  const total =
    groups.length > 1 && currencies.size === 1
      ? money(
          groups.reduce((a, g) => a + Math.round(g.amount * 100), 0) / 100,
          groups[0]!.currency,
        )
      : null;
  return { breakdown, total };
}
