/**
 * E.7.B — Tender oluşturma anındaki TenantAddress JSON snapshot'ı.
 * Adres sonradan değişse veya silinse bile tender bu kaydı korur.
 */
export interface TenderAddressSnapshot {
  id: string;
  type: "FATURA" | "ILETISIM" | "TESLIMAT";
  title: string;
  country: string;
  state: string | null;
  city: string;
  district: string;
  fullAddress: string;
  postalCode: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  snapshotAt: string;
}

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

/** V2-6 — UNSPSC kategori (Class veya Commodity) — backend'den gelen enriched shape. */
export interface TenderCategoryRef {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  breadcrumb: string;
}

export interface TenderListItem {
  id: string;
  tenderNumber: string;
  title: string;
  type: TenderType;
  status: TenderStatus;
  primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  bidsCloseAt: string;
  publishedAt: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string };
  /** V2-6 — Birden fazla kategori. V1 backward-compat: legacy ihalelerde boş array. */
  categories: TenderCategoryRef[];
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
    city: string;
    district: string;
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
  /** V2-7 — Tedarikçi havuzunda arama için anahtar kelimeler (0-10) */
  keywords: string[];
  /** V2-6 — Birden fazla kategori. V1 backward-compat: legacy ihalelerde boş array. */
  categories: TenderCategoryRef[];
  termsAndConditions: string | null;
  internalNotes: string | null;
  isSealedBid: boolean;
  requireAllItems: boolean;
  requireBidDocument: boolean;
  primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  deliveryTerm: DeliveryTerm | null;
  deliveryAddress: string | null;
  /** E.7.B — Tender oluşturma anındaki TenantAddress JSON snapshot'ı. */
  billingAddressSnapshot: TenderAddressSnapshot | null;
  deliveryAddressSnapshot: TenderAddressSnapshot | null;
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
  bidStats: {
    total: number;
    submitted: number;
    draft: number;
    withdrawn: number;
    invitedCount: number;
  };
  /** E.7.D — IN_APPROVAL/IN_AWARD_APPROVAL durumunda aktif onay request bilgisi. */
  activeApprovalRequest: {
    id: string;
    approvalNumber: string;
    type: "TENDER_PUBLISH" | "TENDER_AWARD";
    initiatedById: string;
  } | null;

  // V2-7 — İngiliz Usulü açık eksiltme alanları (RFQ için default değerler döner)
  bidVisibility:
    | "OWN_ONLY"
    | "BEST_PRICE"
    | "OWN_RANK"
    | "BEST_AND_OWN_RANK"
    | "ALL";
  priceDecrementType: "AMOUNT" | "PERCENT" | null;
  priceDecrementValue: string | null;
  priceDecrementBasis: "OWN_LAST_BID" | "BEST_BID" | null;
  decimalPlaces: number;
  sendClosingReminder: boolean;
  reminderMinutesBefore: number;
  autoExtendOnLateBid: boolean;
  autoExtendThresholdMin: number;
  autoExtendByMinutes: number;
  // V2-7 — Round zinciri
  previousTenderId: string | null;
  roundNumber: number;
}

export interface TenderStats {
  total: number;
  draft: number;
  inApproval: number;
  openForBids: number;
  inAward: number;
  inAwardApproval: number;
  awarded: number;
  cancelled: number;
  closedNoAward: number;
}

export type TenderDateRange = "7d" | "30d" | "3m" | "6m" | "12m" | "all";

export interface ListTendersParams {
  status?: TenderStatus;
  search?: string;
  /** Polish-1 — "field:dir" whitelist'li sort */
  sort?: string;
  /** V2-6 — Yaratım tarihi aralığı; default "3m" (son 3 ay). */
  range?: TenderDateRange;
  /** İhaleyi açan satın almacı (User.id). */
  createdById?: string;
  /** UNSPSC kategori filtresi (TenderCategory üzerinden). */
  categoryId?: string;
  /** Para birimi (Tender.primaryCurrency). */
  currency?: Currency;
  /** Tahmini tutar aralığı (Tender.estimatedTotal). */
  amountMin?: number;
  amountMax?: number;
  page?: number;
  pageSize?: number;
}

/** İhale toolbar filtre listesi: ihaleyi açan satın almacı. */
export interface TenderBuyer {
  id: string;
  firstName: string;
  lastName: string;
  tenderCount: number;
}

/** İhale toolbar filtre listesi: kullanılmış kategori. */
export interface TenderCategoryFilter {
  id: string;
  breadcrumb: string;
  level: number;
  tenderCount: number;
}

// Supplier-side types
export interface SupplierTenderListItem {
  id: string;
  tenderNumber: string;
  title: string;
  status: TenderStatus;
  primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  bidsCloseAt: string;
  publishedAt: string | null;
  tenant: { name: string };
  /** V2-6 — Birden fazla kategori. V1 backward-compat: legacy ihalelerde boş array. */
  categories: TenderCategoryRef[];
  itemCount: number;
  invitationStatus: TenderInvitationStatus | null;
  myBidStatus: BidStatus | null;
  myBidVersion: number | null;
}

export interface SupplierTenderListResponse {
  items: SupplierTenderListItem[];
  pagination: Pagination;
}

/**
 * Tedarikçinin gördüğü ihale kalemi. Alıcının `targetUnitPrice` hedef
 * fiyatı rehber olarak tedarikçiye de gösterilir.
 */
export interface SupplierTenderItem {
  id: string;
  tenderId: string;
  orderIndex: number;
  name: string;
  description: string | null;
  quantity: string;
  unit: string;
  materialCode: string | null;
  requiredByDate: string | null;
  targetUnitPrice: string | null;
  customQuestion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTenderDetail {
  id: string;
  tenderNumber: string;
  type: TenderType;
  status: TenderStatus;
  title: string;
  description: string | null;
  /** V2-6 — Birden fazla kategori. V1 backward-compat: legacy ihalelerde boş array. */
  categories: TenderCategoryRef[];
  termsAndConditions: string | null;
  isSealedBid: boolean;
  requireAllItems: boolean;
  requireBidDocument: boolean;
  primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  deliveryTerm: DeliveryTerm | null;
  deliveryAddress: string | null;
  /** E.7.B — supplier teslimat snapshot'ı görür (alıcı tarafı kapalı zarf). */
  deliveryAddressSnapshot: TenderAddressSnapshot | null;
  paymentTerm: PaymentTerm;
  paymentDays: number | null;
  publishedAt: string | null;
  bidsOpenAt: string | null;
  bidsCloseAt: string;
  awardedAt: string | null;
  cancelledAt: string | null;
  tenant: { id: string; name: string };
  items: SupplierTenderItem[];
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

  // V2-7 — İngiliz Usulü açık eksiltme alanları (RFQ için default değerler döner)
  bidVisibility:
    | "OWN_ONLY"
    | "BEST_PRICE"
    | "OWN_RANK"
    | "BEST_AND_OWN_RANK"
    | "ALL";
  priceDecrementType: "AMOUNT" | "PERCENT" | null;
  priceDecrementValue: string | null;
  priceDecrementBasis: "OWN_LAST_BID" | "BEST_BID" | null;
  decimalPlaces: number;
  autoExtendOnLateBid: boolean;
  autoExtendThresholdMin: number;
  autoExtendByMinutes: number;
  /** ENGLISH_AUCTION ise visibility'ye göre filtrelenmiş ranking; RFQ ise null */
  auctionView: {
    bestTotal: number | null;
    myRank: number | null;
    participantCount: number | null;
    allBids: { rank: number; total: number; isMine: boolean }[] | null;
  } | null;
  // V2-7 — Yeni Tur LAZY carry için önceki round bid prefill
  previousTenderId: string | null;
  roundNumber: number;
  previousRoundBid: {
    tenderId: string;
    totalAmount: string;
    notes: string | null;
    items: Array<{
      tenderItemId: string;
      unitPrice: string | null;
      customAnswer: string | null;
    }>;
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
  /** Polish-1 — "field:dir" whitelist'li sort */
  sort?: string;
  /** Yaratım tarihi aralığı. */
  range?: TenderDateRange;
  /** Alıcı (tenant) filtresi. */
  tenantId?: string;
  /** UNSPSC kategori filtresi. */
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface SupplierTenderTenant {
  id: string;
  name: string;
  tenderCount: number;
}

export interface SupplierTenderCategoryFilter {
  id: string;
  breadcrumb: string;
  level: number;
  tenderCount: number;
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
  /** E.5 — alıcı eleme yaptığında dolar (LOST + canResubmit). */
  eliminationReason: string | null;
  eliminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Backend her zaman doldursa da minimal/cache yarış senaryolarında
   * tüketicilerin `?? []` ile koruyabilmesi için optional işaretlendi.
   */
  items?: BidItemExpanded[];
  attachments?: BidAttachmentExpanded[];
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

// ---------- Buyer-side bid monitoring (E.4) ----------

export interface TenderBidsListItem {
  id: string;
  status: BidStatus;
  currency: Currency;
  totalAmount: string;
  version: number;
  submittedAt: string | null;
  withdrawnAt: string | null;
  notes: string | null;
  rank: number | null;
  itemsBidCount: number;
  totalItems: number;
  isComplete: boolean;
  /** V2-3 — submit anındaki TCMB kuru. currency=TRY ise null. */
  exchangeRateSnapshot: {
    rate: number;
    rateDate: string;
    fetchedAt: string;
    source: "TCMB" | "MANUAL" | "FALLBACK";
  } | null;
  supplier: {
    id: string;
    companyName: string;
    taxNumber: string;
    city: string | null;
    membership: "STANDARD" | "PREMIUM";
  };
  submittedBy: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  items: Array<{
    id: string;
    tenderItemId: string;
    unitPrice: string | null;
    totalPrice: string | null;
    currency: Currency;
    customAnswer: string | null;
  }>;
  attachments: Array<{ id: string; fileName: string; fileSize: number }>;
}

export interface TenderBidsResponse {
  tender: {
    id: string;
    tenderNumber: string;
    title: string;
    status: TenderStatus;
    bidsCloseAt: string;
    primaryCurrency: Currency;
  allowedCurrencies: Currency[];
    totalItems: number;
    invitedCount: number;
  };
  summary: {
    total: number;
    complete: number;
    incomplete: number;
    withdrawn: number;
  };
  complete: TenderBidsListItem[];
  incomplete: TenderBidsListItem[];
  withdrawn: TenderBidsListItem[];
}

export interface BidComparisonRow {
  tenderItem: {
    id: string;
    orderIndex: number;
    name: string;
    quantity: string;
    unit: string;
    targetUnitPrice: string | null;
  };
  allBids: Array<{
    bidId: string;
    supplierId: string;
    supplierName: string;
    membership: "STANDARD" | "PREMIUM";
    unitPrice: string;
    totalPrice: string | null;
    currency: Currency;
    /** V2-3 — TRY equivalent (snapshot kuru ile). currency=TRY ise rate=1. */
    unitPriceTry: number;
    totalPriceTry: number | null;
    exchangeRate: number;
    exchangeRateDate: string | null;
  }>;
  bestBid: {
    bidId: string;
    supplierId: string;
    supplierName: string;
    membership: "STANDARD" | "PREMIUM";
    unitPrice: string;
    totalPrice: string | null;
    currency: Currency;
    unitPriceTry: number;
    totalPriceTry: number | null;
    exchangeRate: number;
    exchangeRateDate: string | null;
  } | null;
}

export interface BidComparisonResponse {
  tender: {
    id: string;
    title: string;
    tenderNumber: string;
    status: TenderStatus;
    primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  };
  items: BidComparisonRow[];
}

export interface BidDetailExpanded {
  id: string;
  tenderId: string;
  status: BidStatus;
  currency: Currency;
  totalAmount: string;
  notes: string | null;
  version: number;
  submittedAt: string | null;
  withdrawnAt: string | null;
  /** E.5 — alıcı bu teklifi elediyse dolu. */
  eliminationReason: string | null;
  eliminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rank: number | null;
  totalBids: number;
  totalItems: number;
  itemsBidCount: number;
  isComplete: boolean;
  isDifferentCurrency: boolean;
  primaryCurrency: Currency;
  allowedCurrencies: Currency[];
  /** V2-3 — bid submit anındaki TCMB kuru. bid.currency=TRY ise null. */
  exchangeRateSnapshot: {
    rate: number;
    rateDate: string;
    fetchedAt: string;
    source: "TCMB" | "MANUAL" | "FALLBACK";
  } | null;
  supplier: {
    id: string;
    companyName: string;
    taxNumber: string;
    city: string | null;
    industry: string | null;
    membership: "STANDARD" | "PREMIUM";
  };
  submittedBy: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  items: Array<
    BidItemExpanded & {
      isWinner?: boolean;
    }
  >;
  attachments: BidAttachmentExpanded[];
}

// ---------- Order types (E.5) ----------

export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "IN_DELIVERY"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "IN_PROGRESS"
  | "DELIVERED";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: Currency;
  totalAmount: string;
  expectedDeliveryAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // tenant-side: supplier info
  supplier?: {
    id: string;
    companyName: string;
    taxNumber: string;
    city: string | null;
    membership: "STANDARD" | "PREMIUM";
  };
  // supplier-side: tenant info
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  tender: {
    id: string;
    tenderNumber: string;
    title: string;
  };
  bid: {
    id: string;
    version: number;
    status: BidStatus;
    _count: { items: number };
  };
}

export interface OrderListResponse {
  items: OrderListItem[];
  pagination: Pagination;
}

export interface OrderStats {
  total: number;
  pending: number;
  /** 4-aşamalı akış: PENDING → ACCEPTED → IN_DELIVERY → COMPLETED. */
  accepted: number;
  inDelivery: number;
  completed: number;
  rejected: number;
  cancelled: number;
  /** Legacy field'lar — yeni akışta üretilmiyor; eski kayıtlar için kalmıştır. */
  inProgress?: number;
  delivered?: number;
}

export interface OrderDetailWinningItem {
  id: string;
  unitPrice: string | null;
  totalPrice: string | null;
  currency: Currency;
  customAnswer: string | null;
  awardedQuantity: string | null;
  isWinner: boolean;
  tenderItem: {
    id: string;
    orderIndex: number;
    name: string;
    description: string | null;
    quantity: string;
    unit: string;
    materialCode: string | null;
  };
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: Currency;
  totalAmount: string;
  expectedDeliveryAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // tenant view: supplier dolu, supplier view: tenant dolu
  supplier?: {
    id: string;
    companyName: string;
    taxNumber: string;
    taxOffice: string | null;
    companyType: string | null;
    city: string | null;
    district: string | null;
    addressLine: string | null;
    industry: string | null;
    membership: "STANDARD" | "PREMIUM";
    users: Array<{
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
    }>;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    district: string | null;
  };
  tender: {
    id: string;
    tenderNumber: string;
    title: string;
    status: TenderStatus;
    primaryCurrency: Currency;
  allowedCurrencies: Currency[];
    deliveryTerm: DeliveryTerm | null;
    deliveryAddress: string | null;
    paymentTerm: PaymentTerm;
    paymentDays: number | null;
    /** Creator gate — UI'da action butonlarını gizlemek için kullanılır. */
    createdBy: {
      id: string;
      firstName: string;
      lastName: string;
    };
    items: Array<{
      id: string;
      orderIndex: number;
      name: string;
      description: string | null;
      quantity: string;
      unit: string;
      materialCode: string | null;
    }>;
  };
  bid: {
    id: string;
    version: number;
    status: BidStatus;
    currency: Currency;
    totalAmount: string;
    notes: string | null;
    submittedAt: string | null;
    items: OrderDetailWinningItem[];
    attachments: BidAttachmentExpanded[];
    submittedBy?: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  /** Tedarikçi onay (PENDING → ACCEPTED) */
  acceptedAt: string | null;
  acceptedNote: string | null;
  bankAccountHolder: string | null;
  bankIban: string | null;
  invoiceDate: string | null;
  /** Tedarikçi red (PENDING → REJECTED) */
  rejectedAt: string | null;
  rejectReason: string | null;
  /** Gönderim (ACCEPTED → IN_DELIVERY) */
  deliveryStartedAt: string | null;
  deliveryStartedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  deliveryNote: string | null;
  expectedDeliveryDate: string | null;
  completedAt: string | null;
  completedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  completedNote: string | null;
  cancelledAt: string | null;
  cancelledBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  cancelReason: string | null;
}

/** Sipariş listesi tarih aralığı — tender pattern'iyle aynı. */
export type OrderDateRange = "7d" | "30d" | "3m" | "6m" | "12m" | "all";

export interface ListOrdersParams {
  status?: OrderStatus;
  search?: string;
  supplierId?: string;
  /** Tedarikçi tarafından kullanılır — hangi alıcıdan gelen siparişler. */
  tenantId?: string;
  /** Polish-1 — "field:dir" whitelist'li sort */
  sort?: string;
  /** Oluşturma tarihine göre filtre. Default "all". */
  range?: OrderDateRange;
  page?: number;
  pageSize?: number;
}

export interface OrderCounterpart {
  /** id — alıcı için supplierId, tedarikçi için tenantId */
  id: string;
  /** companyName (supplier) veya name (tenant) — UI tek field gösterir */
  label: string;
  orderCount: number;
}
