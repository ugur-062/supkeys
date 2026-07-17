/**
 * Wizard + badge'ler için tip alias'ları. Eski lib/tenders/types'ın yeni
 * modele uyarlanmış alt kümesi (yalnızca wizard/etiketlerde kullanılanlar).
 */
export type Currency =
  | "TRY"
  | "USD"
  | "EUR"
  | "GBP"
  | "CHF"
  | "JPY"
  | "AED"
  | "CNY"
  | "RUB";

export type DeliveryTerm =
  | "DOMESTIC_DELIVERED"
  | "DOMESTIC_PICKUP"
  | "DOMESTIC_CARRIER_COLLECT"
  | "DOMESTIC_ON_VEHICLE"
  | "EXW"
  | "FCA"
  | "CPT"
  | "CIP"
  | "DAP"
  | "DPU"
  | "DDP"
  | "FAS"
  | "FOB"
  | "CFR"
  | "CIF";

// Ödeme planı (Faz 2) — kategori + koşullu alanlar; zamanlama türetilir.
export type PaymentCategory =
  | "ADVANCE"
  | "DEFERRED"
  | "OPEN_ACCOUNT"
  | "MAL_MUKABILI"
  | "CHEQUE"
  | "SENET"
  | "LETTER_OF_CREDIT"
  | "CASH_AGAINST_DOCS"
  | "CUSTOM";
export type LcSubType = "SIGHT" | "USANCE";
export type PaymentTiming = "BEFORE_DELIVERY" | "AFTER_DELIVERY";
export type PaymentMethod = "CASH" | "CHEQUE";

export type TenderType = "RFQ" | "ENGLISH_AUCTION";

export type TenderStatus =
  | "DRAFT"
  | "IN_APPROVAL"
  | "OPEN_FOR_BIDS"
  | "IN_AWARD"
  | "IN_AWARD_APPROVAL"
  | "AWARDED"
  | "CANCELLED"
  | "CLOSED_NO_AWARD";

export type TenderInvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED";

export type BidStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "WITHDRAWN"
  | "REJECTED"
  | "AWARDED_PARTIAL"
  | "AWARDED_FULL"
  | "LOST";

export type OrderPaymentStatus =
  | "AWAITING_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED";

/** Lojistik ihalesi görüntüleme detayları (LogisticsInfoCard). */
export interface TenderLogisticsDetails {
  transportMode?: string | null;
  originCity?: string | null;
  originDistrict?: string | null;
  originAddress?: string | null;
  destinationCity?: string | null;
  destinationDistrict?: string | null;
  destinationAddress?: string | null;
  cargoType?: string | null;
  weightKg?: number | null;
  volumeM3?: number | null;
  packageCount?: number | null;
  vehicleType?: string | null;
  loadingDate?: string | null;
  deliveryDate?: string | null;
  hazardous?: boolean | null;
  refrigerated?: boolean | null;
  fragile?: boolean | null;
  stackable?: boolean | null;
  notes?: string | null;
}
