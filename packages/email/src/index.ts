export { EmailClient, createEmailClient } from "./client";
export { BaseEmailProvider } from "./providers/base";
export { MailpitProvider } from "./providers/mailpit";
export { ResendProvider } from "./providers/resend";
export { renderEmail } from "./render";
export type {
  ApplicantType,
  ApplicationAdminAlertData,
  ApplicationRejectedData,
  BuyerApplicationApprovedData,
  DemoRequestAdminAlertData,
  DemoRequestReceivedData,
  DemoToRegisterInvitationData,
  EmailClientConfig,
  EmailProviderName,
  EmailRecipient,
  EmailTemplate,
  EmailTemplateData,
  EmailVerificationData,
  RenderedEmail,
  SendEmailInput,
  SendEmailResult,
  SupplierApplicationApprovedData,
  SupplierInvitationData,
} from "./types";
