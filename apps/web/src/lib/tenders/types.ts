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
  | "CNY";

export type DeliveryTerm =
  | "DOMESTIC_DELIVERED"
  | "DOMESTIC_PICKUP"
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

export type PaymentTerm = "CASH" | "DEFERRED";
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
