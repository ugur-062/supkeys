export { EmailClient, createEmailClient } from "./client";
export { BaseEmailProvider } from "./providers/base";
export { ResendProvider } from "./providers/resend";
export { renderEmail } from "./render";
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
} from "./types";
