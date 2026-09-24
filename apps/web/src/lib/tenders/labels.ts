import type {
  Currency,
  DeliveryTerm,
  LcSubType,
  PaymentCategory,
} from "./types";

export const DELIVERY_TERM_LABELS: Record<DeliveryTerm, string> = {
  DOMESTIC_DELIVERED:
    "Adrese teslim, indirilmiş — nakliye ve indirme satıcıya ait",
  DOMESTIC_PICKUP: "Fabrika / Depo teslim — alıcı kendisi alır",
  DOMESTIC_CARRIER_COLLECT:
    "Ambar / Kargoya teslim — nakliye alıcıya ait (karşı ödemeli)",
  DOMESTIC_ON_VEHICLE:
    "Adrese teslim, araç üstü — nakliye satıcıya, indirme alıcıya ait",
  EXW: "EXW (Ex Works) — Tedarikçi tesisinde teslim",
  FCA: "FCA (Free Carrier) — Taşıyıcıya teslim",
  CPT: "CPT (Carriage Paid To) — Taşıma ödenmiş",
  CIP: "CIP (Carriage and Insurance Paid) — Taşıma + sigorta ödenmiş",
  DAP: "DAP (Delivered at Place) — Belirlenen yere teslim",
  DPU: "DPU (Delivered at Place Unloaded) — İndirilmiş teslim",
  DDP: "DDP (Delivered Duty Paid) — Gümrük ödenmiş teslim",
  FAS: "FAS (Free Alongside Ship) — Geminin yanına teslim",
  FOB: "FOB (Free On Board) — Gemiye yüklenmiş teslim",
  CFR: "CFR (Cost and Freight) — Mal + navlun",
  CIF: "CIF (Cost, Insurance and Freight) — Mal + navlun + sigorta",
};

// Ödeme planı (Faz 2) — kategori etiketleri + tek satırlık özet formatlayıcı.
export const PAYMENT_CATEGORY_LABELS: Record<PaymentCategory, string> = {
  ADVANCE: "Peşin",
  DEFERRED: "Vadeli",
  OPEN_ACCOUNT: "Açık Hesap",
  MAL_MUKABILI: "Mal Mukabili",
  CHEQUE: "Çek",
  SENET: "Senet",
  LETTER_OF_CREDIT: "Akreditif",
  CASH_AGAINST_DOCS: "Vesaik Mukabili",
  CUSTOM: "Özel",
};

export const LC_TYPE_LABELS: Record<LcSubType, string> = {
  SIGHT: "Sight — görüldüğünde ödemeli",
  USANCE: "Usance — vadeli",
};

/** Ödeme planını tek satır özetle — ilan detayı, review adımı ve sipariş
 *  detayı aynı metni kullanır. Ör: "Peşin %50 (kalan 30 gün vadeli)",
 *  "Vadeli — 60 gün", "Akreditif (Usance 90 gün, Teyitli)". */
export function formatPaymentPlan(p: {
  paymentCategory?: string | null;
  advancePercent?: number | null;
  paymentDays?: number | null;
  lcType?: string | null;
  lcConfirmed?: boolean | null;
}): string {
  const cat = (p.paymentCategory ?? "OPEN_ACCOUNT") as PaymentCategory;
  switch (cat) {
    case "ADVANCE": {
      const pct = p.advancePercent ?? 100;
      if (pct >= 100) return "Peşin (%100)";
      const rest = p.paymentDays
        ? ` (kalan ${p.paymentDays} gün vadeli)`
        : " (kalan teslim sonrası)";
      return `Peşin %${pct}${rest}`;
    }
    case "DEFERRED":
      return p.paymentDays ? `Vadeli — ${p.paymentDays} gün` : "Vadeli";
    case "OPEN_ACCOUNT":
      return "Açık Hesap (teslim sonrası)";
    case "MAL_MUKABILI":
      return p.paymentDays
        ? `Mal Mukabili — ${p.paymentDays} gün vadeli`
        : "Mal Mukabili (teslim sonrası)";
    case "CHEQUE":
      return p.paymentDays ? `Çek — ${p.paymentDays} gün vadeli` : "Çek";
    case "SENET":
      return p.paymentDays ? `Senet — ${p.paymentDays} gün vadeli` : "Senet";
    case "CASH_AGAINST_DOCS":
      return "Vesaik Mukabili (belge karşılığı)";
    case "LETTER_OF_CREDIT": {
      const parts = [
        p.lcType === "USANCE"
          ? p.paymentDays
            ? `Usance ${p.paymentDays} gün`
            : "Usance"
          : "Sight",
      ];
      if (p.lcConfirmed) parts.push("Teyitli");
      return `Akreditif (${parts.join(", ")})`;
    }
    case "CUSTOM":
      return "Özel ödeme koşulu";
    default:
      return PAYMENT_CATEGORY_LABELS[cat] ?? String(cat);
  }
}

// KDV konvansiyonu (Fix 6): platform fatura KESMEZ, KDV hesaplanmaz. Tek amaç
// karşılaştırma bazını netleştirmek — tedarikçiler farklı KDV varsayarsa teklifler
// kıyaslanamaz. Fiyat girilen/gösterilen ekranlara bu not yerleştirilir.
export const KDV_HARIC_NOTE =
  "Tüm fiyatlar KDV hariçtir. Platform fatura kesmez; KDV'yi taraflar kendi faturalarında uygular.";

// Lojistik İhalesi — taşıma modu etiketleri
export const TRANSPORT_MODE_LABELS: Record<string, string> = {
  ROAD: "Karayolu",
  SEA: "Denizyolu",
  AIR: "Havayolu",
  RAIL: "Demiryolu",
  MULTIMODAL: "Karma",
};

/**
 * Para birimi sembolleri — TEK KAYNAK (denetim Dalga B-2, P10).
 *
 * Repoda ÜÇ ayrı tablo vardı ve ikisi CHF/AED'de çelişiyordu:
 * `components/ui/money.tsx` "CHF"/"AED" (ISO kodu) derken burası ve
 * `lib/format-currency.ts` "₣"/"د.إ" diyordu — aynı tutar iki ekranda iki
 * farklı sembolle çıkıyordu. ISO kodu tercih edildi: "₣" genel frank işareti
 * (İsviçre konvansiyonu CHF) ve "د.إ" sağdan-sola yazılıp LTR tabloda hizayı
 * bozuyor. `money.tsx` ve `format-currency.ts` artık BURAYA bağlı;
 * `format-currency.ts` tümüyle kaldırıldı (ölü kod).
 */
export const CURRENCY_SYMBOL: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF",
  JPY: "¥",
  AED: "AED",
  CNY: "¥",
  RUB: "₽",
};

/**
 * Desteklenen para birimleri — tablodan TÜRETİLİR (dört ayrı elle yazılmış
 * liste vardı; biri güncellenip diğerleri unutulabiliyordu).
 */
export const CURRENCIES = Object.keys(CURRENCY_SYMBOL) as Currency[];

/**
 * Serbest string kod → sembol (bilinmeyen kodda kodun kendisi döner).
 * `Money`/`formatMoney` gevşek `currency: string` aldığı için gerekli.
 */
export function currencySymbol(code: string): string {
  return (CURRENCY_SYMBOL as Record<string, string>)[code] ?? code;
}

export const CURRENCY_NAMES: Record<Currency, string> = {
  TRY: "Türk Lirası",
  USD: "Amerikan Doları",
  EUR: "Euro",
  GBP: "İngiliz Sterlini",
  CHF: "İsviçre Frangı",
  JPY: "Japon Yeni",
  AED: "BAE Dirhemi",
  CNY: "Çin Yuanı",
  RUB: "Rus Rublesi",
};
