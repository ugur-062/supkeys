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

/**
 * Kazandırmanın açtığı siparişin kalem özeti — kalemin FİİLEN hangi kazanan
 * teklife verildiğini çözmek için (`awardedBidForItem`). ALIM'da satıcı =
 * teklifçi; sipariş kalemi kazandırma anında ilan kalemi adı + kazanan teklifin
 * kalem birim fiyatıyla (ikisi de Decimal(18,2)) yazılır.
 */
export interface AwardOrderSnapshot {
  sellerCompanyId: string;
  items: { name: string; unitPrice: unknown }[];
}

const sameMoney = (a: unknown, b: unknown): boolean => {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.round(x * 100) === Math.round(y * 100);
};

/**
 * Bir ilan kalemini FİİLEN kazanan teklif + TRY birim fiyatı. Modelde kalem →
 * kazanan teklif ilişkisi saklanmaz (`ListingItem.awardedQuantity` yalnız
 * miktar); kalem-bazlı kazandırmada AWARDED_PARTIAL / WON teklifler
 * kazanmadıkları kalemlerin fiyatını da taşır. Derin denetim 2026-09-29
 * (MU-18 gözden geçirme): eskiden kazananlar arasındaki EN DÜŞÜK fiyat
 * alınıyordu → kalem en ucuz olmayan kazanana verildiğinde tasarruf fazla,
 * raporda kazanan adı yanlış çıkıyordu.
 *
 * Çözüm sırası:
 *  1. Kalemi fiyatlayan tek kazanan varsa o.
 *  2. Birden çoksa kazandırmanın siparişleri: teklifçinin (satıcı) siparişinde
 *     AYNI ad + AYNI birim fiyatlı kalem olan aday. Tek eşleşme → o.
 *  3. Çözülemezse (sipariş yok / birden çok eşleşme) adaylar arasındaki EN
 *     YÜKSEK TRY fiyatı — en az tasarruf; uydurma tasarruf yok (fail-closed).
 * Seçilen teklifin fiyatı damgasızsa (TRY'ye çevrilemez) null → kalem hesaba
 * KATILMAZ; başka bir teklifin fiyatına düşülmez.
 */
export function awardedBidForItem<
  B extends {
    bidderCompanyId?: string;
    currency: string;
    exchangeRateSnapshot: unknown | null;
    items: { itemId: string; unitPrice: unknown; currency?: string | null; fxToBase?: unknown }[];
  },
>(
  item: { id: string; name?: string | null },
  winners: B[],
  orders?: AwardOrderSnapshot[] | null,
): { bid: B; unitPriceTry: number } | null {
  const candidates = winners.flatMap((bid) => {
    const bi = bid.items.find((x) => x.itemId === item.id);
    return bi ? [{ bid, bi, up: itemUnitPriceTry(bid, bi) }] : [];
  });
  if (candidates.length === 0) return null;
  let pool = candidates;
  if (candidates.length > 1 && orders && orders.length > 0 && item.name != null) {
    const matched = candidates.filter(
      (c) =>
        c.bid.bidderCompanyId != null &&
        orders.some(
          (o) =>
            o.sellerCompanyId === c.bid.bidderCompanyId &&
            o.items.some((oi) => oi.name === item.name && sameMoney(oi.unitPrice, c.bi.unitPrice)),
        ),
    );
    if (matched.length > 0) pool = matched;
  }
  if (pool.length === 1) {
    const only = pool[0]!;
    return only.up == null ? null : { bid: only.bid, unitPriceTry: only.up };
  }
  let pick: { bid: B; unitPriceTry: number } | null = null;
  for (const c of pool) {
    if (c.up == null) continue;
    if (pick == null || c.up > pick.unitPriceTry) pick = { bid: c.bid, unitPriceTry: c.up };
  }
  return pick;
}

type AwardedListingInput = {
  primaryCurrency: string;
  items: { id: string; name?: string | null; quantity: unknown; targetPrice: unknown; awardedQuantity?: unknown }[];
  bids: {
    status?: string;
    bidderCompanyId?: string;
    currency: string;
    exchangeRateSnapshot: unknown | null;
    items: { itemId: string; unitPrice: unknown; currency?: string | null; fxToBase?: unknown }[];
  }[];
  orders?: AwardOrderSnapshot[] | null;
};

/**
 * Kazandırılmış kalem satırları (ortak çekirdek): kalem başına FİİLEN kazanan
 * TRY birim fiyatı × kazandırılan miktar. `unresolved` = bir kazananın
 * fiyatladığı ama TRY'ye çevrilemeyen (damgasız) kalem sayısı.
 */
function awardedItemLines(l: AwardedListingInput) {
  const winners = l.bids.filter(
    (b) => b.status == null || b.status === "WON" || b.status === "AWARDED_PARTIAL",
  );
  const lines: { item: AwardedListingInput["items"][number]; price: number; qty: number }[] = [];
  let unresolved = 0;
  for (const it of l.items) {
    const win = awardedBidForItem(it, winners, l.orders);
    if (win == null) {
      if (winners.some((b) => b.items.some((x) => x.itemId === it.id))) unresolved += 1;
      continue;
    }
    const awarded = it.awardedQuantity != null ? Number(it.awardedQuantity) : NaN;
    const qty = Number.isFinite(awarded) && awarded > 0 ? awarded : Number(it.quantity);
    lines.push({ item: it, price: win.unitPriceTry, qty });
  }
  return { winners, lines, unresolved };
}

/**
 * Kazandırılmış talebin TASARRUF + HACİM hesabı (TRY) — TEK KAYNAK: Tasarruf
 * sekmesi (`satinalmaTasarruf`) ve pano analitiği aynı fonksiyonu kullanır
 * (derin denetim 2026-09-29: analitik her kazanan teklifin TÜM kalemlerini tam
 * `quantity` ile topluyordu — kalem-bazlı kazandırmada AWARDED_PARTIAL teklif
 * kazanmadığı kalemleri de taşır, aynı kalem iki kazanan teklifte sayılıyordu).
 *
 * Kural: yalnız WON / AWARDED_PARTIAL teklifler; kalem başına FİİLEN kazanan
 * teklifin TRY birim fiyatı (`awardedBidForItem` — siparişlerden çözülür;
 * `orders` + kalem `name` + teklif `bidderCompanyId` verilmezse kalemi tek
 * kazanan fiyatlamadıkça en az tasarruflu fiyata düşer), miktar
 * `awardedQuantity > 0 ? awardedQuantity : quantity` (bir kalem tek kazanana
 * verilir — bölünmüş kalem yok). Damgası olmayan fiyat hesaba KATILMAZ; ilan
 * biriminin kuru kazanan teklif damgasından (`listingRateToTry`). Tasarruf
 * yalnız hedefin altındaki farktır (aşım 0).
 */
export function awardedSavingsVolumeTry(l: AwardedListingInput): { savings: number; volume: number } {
  const { winners, lines } = awardedItemLines(l);
  const listingRate = listingRateToTry({ primaryCurrency: l.primaryCurrency, bids: winners });
  let savings = 0;
  let volume = 0;
  for (const { item, price, qty } of lines) {
    volume += price * qty;
    const ref = listingAmountTry(l.primaryCurrency, item.targetPrice, listingRate);
    if (ref != null && ref > price) savings += (ref - price) * qty;
  }
  return { savings, volume };
}

/**
 * Raporların "Kazanan" TUTARI (TRY) — Genel ve Tasarruf raporu TEK KAYNAK
 * (arayüz testi Y-04): kazanan tekliflerin TOPLAMLARI toplanmaz. Kalem bazlı
 * kazandırmada her kısmi kazananın teklifi bütün kalemlerin fiyatını taşır →
 * eski toplam yaklaşık iki katına çıkıp rapor negatif tasarruf gösteriyordu.
 * Değer `awardedSavingsVolumeTry` hacmiyle AYNI hesaptır (kalem başına fiilen
 * kazanan fiyat × miktar). Hiç kalem çözülemezse ya da bir kazananın fiyatladığı
 * kalem damgasız kaldıysa null — eksik tutar tam ya da sahte 0 görünmesin.
 */
export function awardedWinningTotalTry(l: AwardedListingInput): number | null {
  const { lines, unresolved } = awardedItemLines(l);
  if (lines.length === 0 || unresolved > 0) return null;
  return lines.reduce((s, x) => s + x.price * x.qty, 0);
}
