import type { PriceTier } from "./marketplace-api";

/**
 * ÜRÜN FİYAT GÖSTERİMİ — tek kaynak.
 *
 * Üç mod, üçü de MEŞRU. `ON_REQUEST` bir eksiklik değil beyandır: satıcının
 * fiyatını yayımlamak istememesi normaldir ve onu "1 TL" yazmaya zorlamak
 * fiyat alanının tamamını çöpe çevirir (Europages'in yaptığı hata).
 *
 * Bu yüzden `ON_REQUEST` de tam bir cümle döner ("Fiyat için teklif isteyin"),
 * boş ya da tire değil — ziyaretçi eksik veri değil, bilinçli bir seçim
 * gördüğünü anlamalı.
 */
export interface PriceDisplay {
  /** Ana satır — kartta ve sayfa başında. */
  headline: string;
  /** Ek açıklama (kademeli tabloda "100 adetten itibaren" gibi). */
  note: string | null;
  /** Kademeli tablo — varsa sayfada tablo olarak basılır. */
  tiers: PriceTier[] | null;
  /** Fiyat GERÇEKTEN var mı — süzgeç ve schema.org bunu okur. */
  hasPrice: boolean;
}

function fmt(amount: number, currency: string): string {
  return `${amount.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function productPrice(p: {
  priceMode: string;
  priceAmount: string | null;
  priceTiers?: PriceTier[] | null;
  priceCurrency: string;
  unit: string;
}): PriceDisplay {
  if (p.priceMode === "FIXED" && p.priceAmount != null) {
    return {
      headline: `${fmt(Number(p.priceAmount), p.priceCurrency)} / ${p.unit}`,
      note: null,
      tiers: null,
      hasPrice: true,
    };
  }

  if (p.priceMode === "TIERED" && p.priceTiers?.length) {
    // Kademeli tabloda başlık EN DÜŞÜK birim fiyatı gösterir ve bunu açıkça
    // söyler ("…'dan başlayan"). Sadece en düşüğü yazıp koşulunu gizlemek,
    // "gönderen 1,00 €" ile aynı yanıltma olurdu.
    const sorted = [...p.priceTiers].sort((a, b) => a.minQty - b.minQty);
    const cheapest = sorted.reduce((m, t) => (t.unitPrice < m.unitPrice ? t : m));
    return {
      headline: `${fmt(cheapest.unitPrice, p.priceCurrency)} / ${p.unit}`,
      note: `${cheapest.minQty.toLocaleString("tr-TR")} ${p.unit} ve üzeri için`,
      tiers: sorted,
      hasPrice: true,
    };
  }

  return {
    headline: "Fiyat için teklif isteyin",
    note: null,
    tiers: null,
    hasPrice: false,
  };
}
