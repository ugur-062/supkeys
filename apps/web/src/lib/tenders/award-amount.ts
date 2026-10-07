/**
 * Kazandırma onayında gösterilen tutar (kullanıcı kararı 2026-10-07).
 *
 * Kazandırma geri alınamaz; onay penceresi firma adının yanında kazandırılan
 * TUTARI da söyler. Tutar teklif satırının bastığı değerlerden gelir: teklifin
 * kendi birimindeki toplam ve (yabancı birimde, sunucu verdiyse) `amountTry`.
 * İstemcide kur çevrimi YAPILMAZ.
 */
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
 * firma + birim başına açar). Sunucuyla AYNI yuvarlama: grup içinde ham
 * Σ(birim fiyat × miktar) biriktirilir ve kuruşa BİR KEZ, yarım yukarı
 * yuvarlanır (API `buildItemGroups` → `roundMoney`). Satır satır yuvarlayıp
 * toplamak kesirli miktarda sipariş tutarından sapıyordu (1,5 × 3,33 iki kez:
 * 5,00 + 5,00 = 10,00; sipariş 9,99). Tam sayı aritmetiği (kuruş × binde bir)
 * float çarpım hatasını dışarıda tutar; birimler arası çevrim/toplam yapılmaz.
 */
export function itemAwardGroups(selections: readonly ItemAwardSelection[]): ItemAwardGroup[] {
  const groups = new Map<string, ItemAwardGroup & { milli: number }>();
  for (const s of selections) {
    const key = `${s.bidId}|${s.currency}`;
    // kuruş × 1000 — yuvarlanmamış satır tutarı
    const milli = Math.round(s.quantity * 1000) * Math.round(s.unitPrice * 100);
    const g = groups.get(key);
    if (g) g.milli += milli;
    else
      groups.set(key, {
        bidId: s.bidId,
        bidderName: s.bidderName,
        currency: s.currency,
        amount: 0,
        milli,
      });
  }
  return [...groups.values()].map(({ milli, ...g }) => ({
    ...g,
    amount:
      (milli >= 0 ? Math.floor((milli + 500) / 1000) : -Math.floor((-milli + 500) / 1000)) / 100,
  }));
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
