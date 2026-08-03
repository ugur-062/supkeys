import type {
  BidStatus,
  Currency,
  DeliveryTerm,
  LcSubType,
  OrderPaymentStatus,
  PaymentCategory,
  PaymentMethod,
  PaymentTiming,
  TenderInvitationStatus,
  TenderStatus,
  TenderType,
} from "./types";

interface BadgeMeta {
  label: string;
  className: string;
}

export const TENDER_STATUS_META: Record<TenderStatus, BadgeMeta> = {
  DRAFT: {
    label: "Taslak",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  IN_APPROVAL: {
    label: "Onay Bekliyor",
    className: "bg-warning-50 text-warning-700 border-warning-500/30",
  },
  OPEN_FOR_BIDS: {
    label: "Yayında",
    className: "bg-success-50 text-success-700 border-success-500/30",
  },
  IN_AWARD: {
    label: "Değerlendirmede",
    className: "bg-warning-50 text-warning-700 border-warning-500/30",
  },
  IN_AWARD_APPROVAL: {
    label: "Kazandırma Onay Bekliyor",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  AWARDED: {
    label: "Tamamlandı",
    className: "bg-zinc-100 text-zinc-900 border-zinc-300",
  },
  CANCELLED: {
    label: "İptal",
    className: "bg-danger-50 text-danger-700 border-danger-500/30",
  },
  CLOSED_NO_AWARD: {
    label: "Kapatıldı",
    className: "bg-slate-200 text-slate-600 border-slate-300",
  },
};

/**
 * Ham TenderStatus enum'unu (DB/back-end değeri, ör. OPEN_FOR_BIDS) kullanıcıya
 * Türkçe gösterir. DB/back-end değişmez; bu yalnızca görünüm içindir.
 * Bilinmeyen değer gelirse ham değeri döndürür (kırılmaz).
 */
export function tenderStatusLabel(status: string): string {
  return (
    (TENDER_STATUS_META as Record<string, BadgeMeta>)[status]?.label ?? status
  );
}

export const TENDER_TYPE_META: Record<TenderType, BadgeMeta> = {
  RFQ: {
    label: "Teklif Toplama",
    className: "bg-zinc-100 text-zinc-900 border-zinc-300",
  },
  ENGLISH_AUCTION: {
    // Kullanıcı yüzünde "Pazarlık" (açık eksiltme/artırma) — iç enum değişmedi.
    label: "Pazarlık",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

export const INVITATION_STATUS_META: Record<TenderInvitationStatus, BadgeMeta> =
  {
    PENDING: {
      label: "Bekliyor",
      className: "bg-warning-50 text-warning-700 border-warning-500/30",
    },
    ACCEPTED: {
      label: "Kabul Etti",
      className: "bg-success-50 text-success-700 border-success-500/30",
    },
    DECLINED: {
      label: "Reddetti",
      className: "bg-slate-100 text-slate-600 border-slate-300",
    },
    EXPIRED: {
      label: "Süresi Doldu",
      className: "bg-slate-100 text-slate-500 border-slate-200",
    },
  };

export const BID_STATUS_META: Record<BidStatus, BadgeMeta> = {
  DRAFT: {
    label: "Taslak",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  SUBMITTED: {
    label: "Verildi",
    className: "bg-zinc-100 text-zinc-900 border-zinc-300",
  },
  WITHDRAWN: {
    label: "Geri Çekildi",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
  REJECTED: {
    label: "Reddedildi",
    className: "bg-danger-50 text-danger-600 border-danger-500/30",
  },
  AWARDED_PARTIAL: {
    label: "Kısmen Kazandı 🏆",
    className: "bg-success-50 text-success-700 border-success-500/30",
  },
  AWARDED_FULL: {
    label: "Kazandı 🏆",
    className: "bg-success-50 text-success-700 border-success-500/30",
  },
  LOST: {
    label: "Kaybetti",
    className: "bg-slate-100 text-slate-600 border-slate-300",
  },
};

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

// SATIS teklifinde alıcının teslimat adresi zorunlu olan (adrese-teslim)
// şartlar — backend BUYER_ADDRESS_REQUIRED_TERMS ile eş tutulmalı.
export const BUYER_ADDRESS_REQUIRED_TERMS: DeliveryTerm[] = [
  "DOMESTIC_DELIVERED",
  "DOMESTIC_ON_VEHICLE",
  "DOMESTIC_CARRIER_COLLECT",
  "DAP",
  "DPU",
  "DDP",
];

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

// Ödeme zamanı (türetilmiş — Faz 3'e köprü, sipariş akışı hâlâ okur)
export const PAYMENT_TIMING_LABELS: Record<PaymentTiming, string> = {
  BEFORE_DELIVERY: "Teslim öncesi",
  AFTER_DELIVERY: "Teslim sonrası",
};

// Açık İhale — görünürlük
export const TENDER_VISIBILITY_LABELS: Record<
  "PRIVATE" | "PUBLIC",
  string
> = {
  PRIVATE: "Davetli (Kapalı)",
  PUBLIC: "Herkese Açık",
};

// Faz 3 madde 16 — Ödeme şekli
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Nakit",
  CHEQUE: "Çek",
};

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  AWAITING_CONFIRMATION: "Onay bekliyor",
  CONFIRMED: "Onaylandı",
  REJECTED: "Reddedildi",
};

// Lojistik İhalesi — taşıma modu etiketleri
export const TRANSPORT_MODE_LABELS: Record<string, string> = {
  ROAD: "Karayolu",
  SEA: "Denizyolu",
  AIR: "Havayolu",
  RAIL: "Demiryolu",
  MULTIMODAL: "Karma",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "₣",
  JPY: "¥",
  AED: "د.إ",
  CNY: "¥",
  RUB: "₽",
};

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
