export { EmailClient, createEmailClient } from "./client";
export { BaseEmailProvider } from "./providers/base";
export { ResendProvider } from "./providers/resend";
export { renderEmail } from "./render";
export type { EmailEnv } from "./templates/_components/email-env";
export type {
  EmailClientConfig,
  EmailProviderName,
  EmailRecipient,
  EmailTemplate,
  EmailTemplateData,
  PasswordResetData,
  ReferralInviteData,
  RenderedEmail,
  SendEmailInput,
  SendEmailResult,
  TenderExternalInviteData,
  TenderExternalInviteItem,
} from "./types";
