export type TenderType = "RFQ" | "ENGLISH_AUCTION";

export type TenderStatus =
  | "DRAFT"
  | "OPEN_FOR_BIDS"
  | "IN_AWARD"
  | "AWARDED"
  | "CANCELLED"
  | "CLOSED_NO_AWARD";

export type Currency = "TRY" | "USD" | "EUR";

export type DeliveryTerm =
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

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TenderListItem {
  id: string;
  tenderNumber: string;
  title: string;
  type: TenderType;
  status: TenderStatus;
  primaryCurrency: Currency;
  bidsCloseAt: string;
  publishedAt: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string };
  itemCount: number;
  invitationCount: number;
  bidCount: number;
}

export interface TenderListResponse {
  items: TenderListItem[];
  pagination: Pagination;
}

export interface TenderItemDetail {
  id: string;
  orderIndex: number;
  name: string;
  description: string | null;
  quantity: string; // Decimal serialized as string
  unit: string;
  materialCode: string | null;
  requiredByDate: string | null;
  targetUnitPrice: string | null;
  customQuestion: string | null;
}

export interface TenderInvitationDetail {
  id: string;
  status: TenderInvitationStatus;
  invitedAt: string;
  respondedAt: string | null;
  emailSentAt: string | null;
  emailOpenedAt: string | null;
  supplier: {
    id: string;
    companyName: string;
    membership: "STANDARD" | "PREMIUM";
    taxNumber: string;
  };
}

export interface TenderAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface TenderDetail {
  id: string;
  tenderNumber: string;
  type: TenderType;
  status: TenderStatus;
  title: string;
  description: string | null;
  termsAndConditions: string | null;
  internalNotes: string | null;
  isSealedBid: boolean;
  requireAllItems: boolean;
  requireBidDocument: boolean;
  primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  decimalPlaces: number;
  deliveryTerm: DeliveryTerm | null;
  deliveryAddress: string | null;
  paymentTerm: PaymentTerm;
  paymentDays: number | null;
  publishedAt: string | null;
  bidsOpenAt: string | null;
  bidsCloseAt: string;
  awardedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  items: TenderItemDetail[];
  invitations: TenderInvitationDetail[];
  attachments: TenderAttachment[];
  bidStats: { total: number; submitted: number; draft: number };
}

export interface TenderStats {
  total: number;
  draft: number;
  openForBids: number;
  inAward: number;
  awarded: number;
  cancelled: number;
  closedNoAward: number;
}

export interface ListTendersParams {
  status?: TenderStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

// Supplier-side types
export interface SupplierTenderListItem {
  id: string;
  tenderNumber: string;
  title: string;
  status: TenderStatus;
  primaryCurrency: Currency;
  bidsCloseAt: string;
  publishedAt: string | null;
  tenant: { name: string };
  itemCount: number;
  invitationStatus: TenderInvitationStatus | null;
  myBidStatus: BidStatus | null;
  myBidVersion: number | null;
}

export interface SupplierTenderListResponse {
  items: SupplierTenderListItem[];
  pagination: Pagination;
}

export interface SupplierTenderDetail {
  id: string;
  tenderNumber: string;
  type: TenderType;
  status: TenderStatus;
  title: string;
  description: string | null;
  termsAndConditions: string | null;
  isSealedBid: boolean;
  requireAllItems: boolean;
  requireBidDocument: boolean;
  primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  decimalPlaces: number;
  deliveryTerm: DeliveryTerm | null;
  deliveryAddress: string | null;
  paymentTerm: PaymentTerm;
  paymentDays: number | null;
  publishedAt: string | null;
  bidsOpenAt: string | null;
  bidsCloseAt: string;
  awardedAt: string | null;
  cancelledAt: string | null;
  tenant: { id: string; name: string };
  items: TenderItemDetail[];
  attachments: TenderAttachment[];
  myInvitation: {
    status: TenderInvitationStatus;
    invitedAt: string;
  };
  myBid: {
    id: string;
    status: BidStatus;
    currency: Currency;
    totalAmount: string;
    version: number;
    submittedAt: string | null;
    notes: string | null;
  } | null;
}

export interface SupplierTenderStats {
  activeInvitations: number;
  submittedBids: number;
  wonTenders: number;
  ongoingOrders: number;
}

export interface ListSupplierTendersParams {
  filter?: "active" | "past" | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}

// ---------- Bid (E.3) ----------

export interface BidItemExpanded {
  id: string;
  tenderItemId: string;
  unitPrice: string; // Decimal serialized
  totalPrice: string;
  currency: Currency;
  customAnswer: string | null;
  tenderItem: {
    id: string;
    orderIndex: number;
    name: string;
    description: string | null;
    quantity: string;
    unit: string;
    materialCode: string | null;
    customQuestion: string | null;
  };
}

export interface BidAttachmentExpanded {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  uploadedAt: string;
}

export interface MyBidDetail {
  id: string;
  status: BidStatus;
  currency: Currency;
  totalAmount: string;
  notes: string | null;
  version: number;
  submittedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: BidItemExpanded[];
  attachments: BidAttachmentExpanded[];
}

export interface BidFormItem {
  tenderItemId: string;
  unitPrice: number | null;
  customAnswer?: string;
}

export interface BidFormAttachment {
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
}

export interface BidFormPayload {
  currency: Currency;
  notes?: string;
  items: BidFormItem[];
  attachments?: BidFormAttachment[];
}
