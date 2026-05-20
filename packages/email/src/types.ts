export type EmailTemplate =
  | "demo_request_received"
  | "demo_request_admin_alert"
  | "demo_to_register_invitation"
  | "buyer_email_verification"
  | "supplier_email_verification"
  | "buyer_application_admin_alert"
  | "supplier_application_admin_alert"
  | "buyer_application_approved"
  | "supplier_application_approved"
  | "application_rejected"
  | "supplier_invitation"
  | "supplier_relation_established_buyer"
  | "supplier_relation_established_supplier"
  | "tender_invitation"
  | "tender_closed_supplier"
  | "tender_closed_buyer"
  | "bid_eliminated_supplier"
  | "award_won_supplier"
  | "award_lost_supplier"
  | "award_completed_buyer"
  | "user_invitation"
  | "approval_required"
  | "approval_approved"
  | "approval_rejected"
  | "approval_reminder"
  | "order_status_changed"
  | "message_notification"
  | "admin_password_reset";

export type EmailProviderName = "resend";

export interface EmailRecipient {
  email: string;
  name?: string;
}

// ============================================================
// Demo request data shapes (mevcut)
// ============================================================

export interface DemoRequestReceivedData {
  contactName: string;
  companyName: string;
  email: string;
  phone?: string | null;
  message?: string | null;
}

export interface DemoRequestAdminAlertData {
  contactName: string;
  companyName: string;
  email: string;
  phone?: string | null;
  jobTitle?: string | null;
  companySize?: string | null;
  message?: string | null;
  demoRequestId: string;
  adminPanelUrl: string;
}

// ============================================================
// Registration data shapes
// ============================================================

export type ApplicantType = "buyer" | "supplier";

export interface EmailVerificationData {
  firstName: string;
  companyName: string;
  verifyUrl: string;
  /** ISO datetime — son geçerlilik */
  expiresAt: string;
}

export interface ApplicationAdminAlertData {
  applicationId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  taxNumber: string;
  city: string;
  industry?: string | null;
  invitedByTenantName?: string | null;
  reviewUrl: string;
}

export interface BuyerApplicationApprovedData {
  firstName: string;
  companyName: string;
  loginUrl: string;
}

export interface SupplierApplicationApprovedData {
  firstName: string;
  companyName: string;
  loginUrl: string;
  invitedByTenantName?: string | null;
}

export interface ApplicationRejectedData {
  firstName: string;
  companyName: string;
  applicantType: ApplicantType;
  rejectionReason: string;
  supportEmail: string;
}

export interface DemoToRegisterInvitationData {
  contactName: string;
  companyName: string;
  message?: string | null;
  registerUrl: string;
  /** Formatted human-readable date, e.g. "30 Nisan 2026" */
  expiresAt: string;
}

export interface UserInvitationData {
  recipientEmail: string;
  tenantName: string;
  inviterName: string;
  /** Enum value (örn "COMPANY_ADMIN", "BUYER", "APPROVER") */
  role: string;
  /** Türkçe rol etiketi (örn "Yönetici") */
  roleLabel: string;
  acceptUrl: string;
  expiresInDays: number;
}

export interface SupplierInvitationData {
  inviterTenantName: string;
  inviterUserName: string;
  contactName?: string | null;
  message?: string | null;
  /**
   * Yeni tedarikçi: register URL (`/register/supplier?invitation=…`).
   * Mevcut tedarikçi: login redirect URL (`/supplier/login?next=/supplier/profil?invitation=…`).
   */
  acceptUrl: string;
  /**
   * `true` → davet edilen e-posta zaten platforma kayıtlı bir SupplierUser'a ait;
   * şablon "hesabınızla giriş yapın ve daveti kabul edin" akışına geçer + manuel
   * kısa kod gösterir. `false` (varsayılan) → klasik "kayıt olun" akışı.
   */
  isExistingSupplier?: boolean;
  /** Manuel girilebilen kısa kod (K7X9-3M2P). Sadece existingSupplier akışında gösterilir. */
  shortCode?: string | null;
  /** ISO datetime — davet süresi */
  expiresAt: string;
}

/**
 * Mevcut tedarikçi davet kabul ettiğinde alıcı tarafındaki COMPANY_ADMIN'lere
 * giden bilgilendirme e-postası — onay aşaması yok, ilişki direkt ACTIVE.
 */
export interface SupplierRelationEstablishedBuyerData {
  /** Bilgilendirilen tenant admininin adı */
  adminFirstName: string;
  /** Alıcı tenant adı (e-postanın gönderildiği tenant) */
  tenantName: string;
  /** Davete katılan tedarikçi firma adı */
  supplierCompanyName: string;
  supplierTaxNumber: string;
  supplierCity?: string | null;
  supplierIndustry?: string | null;
  /** Tedarikçinin primary user e-postası */
  supplierContactEmail: string;
  /** /dashboard/tedarikciler?tab=approved deep link */
  tedarikciDetayUrl: string;
}

/**
 * Mevcut tedarikçinin davet kabul akışı tamamlandığında kendisine giden
 * "bağlantı aktif" bildirimi.
 */
export interface SupplierRelationEstablishedSupplierData {
  /** Tedarikçi yetkilisinin adı */
  supplierUserName: string;
  /** Yeni bağlanılan alıcı tenant adı */
  tenantName: string;
  /** Tedarikçi paneli profil URL'i */
  profileUrl: string;
}

export interface TenderInvitationEmailData {
  /** Tedarikçi yetkilisinin adı (full name) */
  supplierUserName: string;
  /** Daveti gönderen alıcı tenant adı */
  tenantName: string;
  /** Otomatik üretilmiş ihale numarası (örn. SUPK-2026-0042) */
  tenderNumber: string;
  /** İhale başlığı */
  tenderTitle: string;
  /** Tedarikçi panelinde detaya götüren mutlak URL */
  tenderUrl: string;
  /** Kalem sayısı */
  itemCount: number;
  /** Kapanış tarihinin insan-okur biçimi (örn. "12 Mayıs 2026, 17:00") */
  bidsCloseAtFormatted: string;
}

/**
 * İhale kapandığında davetli tedarikçilere giden bilgilendirme.
 * `hasBid` true → "değerlendirmeye alındı" tonu;
 * false → "bu ihaleye teklif vermediniz" bilgisi.
 */
export interface TenderClosedSupplierData {
  supplierUserName: string;
  tenantName: string;
  tenderNumber: string;
  tenderTitle: string;
  hasBid: boolean;
  /** /supplier/ihaleler/:id mutlak URL */
  tenderUrl: string;
}

/**
 * İhale kapandığında ihaleyi açan kullanıcıya (createdBy) gider —
 * davet/teklif sayılarıyla "kazandırma zamanı" bildirimi.
 */
export interface TenderClosedBuyerData {
  buyerFirstName: string;
  tenderNumber: string;
  tenderTitle: string;
  bidCount: number;
  invitedCount: number;
  /** /dashboard/ihaleler/:id mutlak URL */
  tenderUrl: string;
}

/**
 * Alıcı tedarikçinin SUBMITTED teklifini elediğinde gönderilen e-posta.
 * `canResubmit=true` → ihale OPEN_FOR_BIDS ve kapanış geleceğe; tedarikçi
 * yeniden teklif verebilir. Aksi halde sadece bilgilendirme.
 */
export interface BidEliminatedSupplierData {
  supplierUserName: string;
  tenantName: string;
  tenderNumber: string;
  tenderTitle: string;
  /** Alıcının verdiği serbest metin (10-500 karakter). */
  eliminationReason: string;
  /** İhale hâlâ aktifse true → "Yeniden Teklif Ver" CTA gösterilir. */
  canResubmit: boolean;
  /** /supplier/ihaleler/:id mutlak URL (canResubmit=false branch) */
  tenderUrl: string;
  /** /supplier/ihaleler/:id/teklif-ver mutlak URL (canResubmit=true branch) */
  submitNewBidUrl: string;
}

/**
 * Kazandırma sonrası kazanan tedarikçiye giden e-posta.
 * `isFullWin=true` → tüm kalemler bu tedarikçide; aksi halde kısmi kazanım.
 */
export interface AwardWonSupplierData {
  supplierUserName: string;
  tenantName: string;
  tenderNumber: string;
  tenderTitle: string;
  /** ORD-YYYY-NNNN */
  orderNumber: string;
  winningItemsCount: number;
  totalItemsCount: number;
  isFullWin: boolean;
  /** Sayısal toplam tutar (number; client TR locale ile format eder) */
  totalAmount: number;
  /** Currency enum string ("TRY" | "USD" | "EUR") */
  currency: string;
  /** /supplier/siparisler/:id mutlak URL */
  orderUrl: string;
}

/**
 * Kaybeden tedarikçiye gider — kazanan başka biri.
 */
export interface AwardLostSupplierData {
  supplierUserName: string;
  tenantName: string;
  tenderNumber: string;
  tenderTitle: string;
  /** /supplier/ihaleler/:id mutlak URL */
  tenderUrl: string;
}

/**
 * Kazandırma tamamlandığında alıcıya (createdBy) giden özet e-postası.
 */
export interface AwardCompletedBuyerData {
  buyerFirstName: string;
  tenderNumber: string;
  tenderTitle: string;
  totalOrders: number;
  winnerCount: number;
  loserCount: number;
  /** Tüm sipariş tutarları toplamı (numeric) */
  totalSpend: number;
  /** Currency enum string */
  currency: string;
  /** /dashboard/ihaleler/:id mutlak URL */
  tenderUrl: string;
}

/**
 * Onay süreci type discriminator — şablonlar TENDER_PUBLISH ve TENDER_AWARD
 * için farklı dil kullanır ("İhale Yayını" vs "Kazandırma").
 */
export type ApprovalEmailType = "TENDER_PUBLISH" | "TENDER_AWARD";

/**
 * Bir onay adımı PENDING'e geçtiğinde ilgili approver'a gider.
 */
export interface ApprovalRequiredData {
  approverFirstName: string;
  approvalNumber: string;
  tenderNumber: string;
  tenderTitle: string;
  initiatorName: string;
  flowName: string;
  amount: number;
  currency: string;
  approvalType: ApprovalEmailType;
  /** /dashboard/onay-bekleyenler/:id mutlak URL */
  approvalUrl: string;
  initiatorNote?: string | null;
  /**
   * V1.5 — Approver pasifleştirildiğinde cron başka bir admin'e atadığında true.
   * UI'da "Otomatik Atama" sarı banner'ı göstermek için.
   */
  isFallback?: boolean;
  /** Eski (pasifleştirilen) approver'ın adı; isFallback=true iken doldurulur. */
  originalApproverName?: string;
}

/**
 * Tüm adımlar onayladıktan sonra request başlatıcısına gider.
 */
export interface ApprovalApprovedData {
  initiatorFirstName: string;
  approvalNumber: string;
  tenderNumber: string;
  tenderTitle: string;
  flowName: string;
  approvalType: ApprovalEmailType;
  approverCount: number;
  lastApproverName: string;
  /** /dashboard/ihaleler/:id mutlak URL */
  tenderUrl: string;
}

/**
 * V1.5 — 3+ gün PENDING kalan approval request için bekleyen approver'a hatırlatma.
 */
export interface ApprovalReminderData {
  approverFirstName: string;
  approvalNumber: string;
  tenderNumber: string;
  tenderTitle: string;
  initiatorName: string;
  flowName: string;
  amount: number;
  currency: string;
  approvalType: ApprovalEmailType;
  /** /dashboard/onay-bekleyenler/:id mutlak URL */
  approvalUrl: string;
  daysWaiting: number;
}

/**
 * Bir onay adımı reddedildiğinde başlatıcıya gider.
 */
export interface ApprovalRejectedData {
  initiatorFirstName: string;
  approvalNumber: string;
  tenderNumber: string;
  tenderTitle: string;
  flowName: string;
  approvalType: ApprovalEmailType;
  rejectorName: string;
  rejectionNote: string;
  /** /dashboard/ihaleler/:id mutlak URL */
  tenderUrl: string;
}

export type EmailTemplateData =
  | { template: "demo_request_received"; data: DemoRequestReceivedData }
  | { template: "demo_request_admin_alert"; data: DemoRequestAdminAlertData }
  | {
      template: "demo_to_register_invitation";
      data: DemoToRegisterInvitationData;
    }
  | { template: "buyer_email_verification"; data: EmailVerificationData }
  | { template: "supplier_email_verification"; data: EmailVerificationData }
  | {
      template: "buyer_application_admin_alert";
      data: ApplicationAdminAlertData;
    }
  | {
      template: "supplier_application_admin_alert";
      data: ApplicationAdminAlertData;
    }
  | {
      template: "buyer_application_approved";
      data: BuyerApplicationApprovedData;
    }
  | {
      template: "supplier_application_approved";
      data: SupplierApplicationApprovedData;
    }
  | { template: "application_rejected"; data: ApplicationRejectedData }
  | { template: "supplier_invitation"; data: SupplierInvitationData }
  | {
      template: "supplier_relation_established_buyer";
      data: SupplierRelationEstablishedBuyerData;
    }
  | {
      template: "supplier_relation_established_supplier";
      data: SupplierRelationEstablishedSupplierData;
    }
  | { template: "tender_invitation"; data: TenderInvitationEmailData }
  | { template: "tender_closed_supplier"; data: TenderClosedSupplierData }
  | { template: "tender_closed_buyer"; data: TenderClosedBuyerData }
  | {
      template: "bid_eliminated_supplier";
      data: BidEliminatedSupplierData;
    }
  | { template: "award_won_supplier"; data: AwardWonSupplierData }
  | { template: "award_lost_supplier"; data: AwardLostSupplierData }
  | { template: "award_completed_buyer"; data: AwardCompletedBuyerData }
  | { template: "user_invitation"; data: UserInvitationData }
  | { template: "approval_required"; data: ApprovalRequiredData }
  | { template: "approval_approved"; data: ApprovalApprovedData }
  | { template: "approval_rejected"; data: ApprovalRejectedData }
  | { template: "approval_reminder"; data: ApprovalReminderData }
  | { template: "order_status_changed"; data: OrderStatusChangedData }
  | { template: "message_notification"; data: MessageNotificationData }
  | { template: "admin_password_reset"; data: AdminPasswordResetData };

/**
 * V2-6.5 — Super-admin destek operasyonu sonucu kullanıcıya gönderilen
 * tek kullanımlık parola sıfırlama linki.
 */
export interface AdminPasswordResetData {
  firstName: string;
  email: string;
  resetUrl: string;
  /** Token TTL — şablonda "60 dakika" gibi gösterilir. */
  expiresInMinutes: number;
}

/**
 * V2-4 — 1-on-1 mesajlaşma. Karşı taraf 5dk içinde okumadıysa
 * cron debounce ile bu e-posta gider.
 */
export interface MessageNotificationData {
  recipientName: string;
  /** Gönderen tarafın firma adı (Tenant veya Supplier) */
  senderCompanyName: string;
  /** Gönderen kişi adı (firstName + lastName) */
  senderPersonName: string;
  /** Bağlam etiketi: "Sipariş ORD-2026-0042" veya "İhale SUPK-2026-0019" */
  contextLabel: string;
  /** Mesaj içeriğinin ilk 200 karakteri (TR — eklenmiş ellipsis flag) */
  messagePreview: string;
  /** En fazla 200 karakter mi gösterildi? UI "..." gösterir */
  isTruncated: boolean;
  /** Detay sayfasına dönen URL (tenant veya supplier panel) */
  ctaUrl: string;
}

/**
 * Sipariş statü değişimlerinde karşı tarafa gider.
 * - PENDING → ACCEPTED: tedarikçi onayladı, alıcıya bildirim
 * - PENDING → REJECTED: tedarikçi reddetti, alıcıya bildirim
 * - ACCEPTED → IN_DELIVERY: tedarikçi gönderim başlattı, alıcıya bildirim
 * - IN_DELIVERY → COMPLETED: alıcı teslim aldı, tedarikçiye bildirim
 * - PENDING/ACCEPTED/IN_DELIVERY → CANCELLED: alıcı iptal, tedarikçiye bildirim
 */
export type OrderStatusChange =
  | "ACCEPTED"
  | "REJECTED"
  | "IN_DELIVERY"
  | "COMPLETED"
  | "CANCELLED";

export interface OrderStatusChangedData {
  recipientName: string;
  /** "buyer" → tedarikçi karşı tarafta; "supplier" → alıcı karşı tarafta */
  recipient: "buyer" | "supplier";
  orderNumber: string;
  tenderNumber: string;
  tenderTitle: string;
  newStatus: OrderStatusChange;
  /** Eski statü — sadece info amaçlı (UI'da render edilebilir) */
  oldStatus: "PENDING" | "ACCEPTED" | "IN_DELIVERY";
  /** Onay notu, red sebebi, kargo notu, teslim notu veya iptal sebebi */
  note?: string | null;
  /** ISO date — ACCEPT veya IN_DELIVERY anında tedarikçinin verdiği tahmini teslim */
  expectedDeliveryDate?: string | null;
  /** Karşı taraftaki sipariş detay URL'i (alıcı veya tedarikçi paneli) */
  orderUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailInput {
  to: EmailRecipient;
  from: { email: string; name?: string };
  replyTo?: string;
  rendered: RenderedEmail;
}

export interface SendEmailResult {
  providerMessageId: string | null;
}

export interface EmailClientConfig {
  provider: EmailProviderName;
  from: { email: string; name?: string };
  replyTo?: string;
  resend?: { apiKey: string };
}
