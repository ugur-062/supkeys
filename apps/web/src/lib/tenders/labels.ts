import type {
  BidStatus,
  Currency,
  DeliveryTerm,
  PaymentTerm,
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
  OPEN_FOR_BIDS: {
    label: "Yayında",
    className: "bg-success-50 text-success-700 border-success-500/30",
  },
  IN_AWARD: {
    label: "Kazandırma Aşamasında",
    className: "bg-warning-50 text-warning-700 border-warning-500/30",
  },
  AWARDED: {
    label: "Tamamlandı",
    className: "bg-brand-50 text-brand-700 border-brand-200",
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

export const TENDER_TYPE_META: Record<TenderType, BadgeMeta> = {
  RFQ: {
    label: "RFQ",
    className: "bg-brand-50 text-brand-700 border-brand-200",
  },
  ENGLISH_AUCTION: {
    label: "İngiliz Usulü",
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
    className: "bg-brand-50 text-brand-700 border-brand-200",
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

export const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  CASH: "Peşin",
  DEFERRED: "Vadeli",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
};
