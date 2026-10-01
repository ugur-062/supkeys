import type { PriceTier } from "./marketplace-api";
import { affixCurrency } from "@/lib/tenders/labels";

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

/** "41.000 ₺" — sembol tek kaynaktan (`CURRENCY_SYMBOL`); bilinmeyen kod olduğu gibi. */
/**
 * Dil bilen etiketler (i18n Faz 1) — ÇAĞIRAN VERİR, varsayılan YOK.
 * İstemci: `usePriceLabels()` (i18n/domain.ts); sunucu: `priceLabelsFor()` (i18n/server.ts).
 * Katalog BURAYA import edilmez: bu modül istemci kartlarına giriyor; Türkçe
 * bir yedek sözlük tutmak da katalogla ayrışan ikinci bir kaynak olurdu.
 */
export interface PriceLabels {
  locale: string;
  onRequest: string;
  /**
   * "100 adet ve üzeri için" — miktar + birim DİLİN ÇOĞUL KURALIYLA ("for 100
   * pieces and above", "100 коробок и более"); birim kodu varsa katalogdan.
   */
  fromQty: (minQty: number, unit: string, unitCode?: string | null) => string;
}

/**
 * Tutar + para birimi — başlık, kademe tablosu ve kart AYNI biçimi kullanır
 * (sembolün yeri dilden, `affixCurrency`). Kademe satırı eskiden
 * `{sayı} {kod}` basıyordu ("9,8 TRY" başlıktaki "8,4 ₺"nin yanında —
 * arayüz testi D-057).
 */
export function formatProductPrice(amount: number, currency: string, locale: string): string {
  return fmt(amount, currency, locale);
}

function fmt(amount: number, currency: string, locale: string): string {
  return affixCurrency(
    amount.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    currency,
    locale,
  );
}

export function productPrice(p: {
  priceMode: string;
  priceAmount: string | null;
  priceTiers?: PriceTier[] | null;
  priceCurrency: string;
  unit: string;
  unitCode?: string | null;
}, labels: PriceLabels): PriceDisplay {
  if (p.priceMode === "FIXED" && p.priceAmount != null) {
    return {
      headline: `${fmt(Number(p.priceAmount), p.priceCurrency, labels.locale)} / ${p.unit}`,
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
      headline: `${fmt(cheapest.unitPrice, p.priceCurrency, labels.locale)} / ${p.unit}`,
      note: labels.fromQty(cheapest.minQty, p.unit, p.unitCode),
      tiers: sorted,
      hasPrice: true,
    };
  }

  return {
    headline: labels.onRequest,
    note: null,
    tiers: null,
    hasPrice: false,
  };
}
