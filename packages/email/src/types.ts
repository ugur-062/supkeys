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
  | "supplier_invitation";

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
  acceptUrl: string;
  /** ISO datetime — davet süresi */
  expiresAt: string;
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
  | { template: "supplier_invitation"; data: SupplierInvitationData };

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
