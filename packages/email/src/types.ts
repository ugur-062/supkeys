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
  | "award_completed_buyer";

export type EmailProviderName = "resend" | "mailpit";

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
  | { template: "award_completed_buyer"; data: AwardCompletedBuyerData };

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
  mailpit?: { host: string; port: number };
}
