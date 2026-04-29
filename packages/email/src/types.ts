export type EmailTemplate =
  | "demo_request_received"
  | "demo_request_admin_alert";

export type EmailProviderName = "resend" | "mailpit";

export interface EmailRecipient {
  email: string;
  name?: string;
}

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

export type EmailTemplateData =
  | { template: "demo_request_received"; data: DemoRequestReceivedData }
  | { template: "demo_request_admin_alert"; data: DemoRequestAdminAlertData };

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
