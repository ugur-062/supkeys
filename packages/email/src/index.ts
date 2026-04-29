export { EmailClient, createEmailClient } from "./client";
export { BaseEmailProvider } from "./providers/base";
export { MailpitProvider } from "./providers/mailpit";
export { ResendProvider } from "./providers/resend";
export { renderEmail } from "./render";
export type {
  DemoRequestAdminAlertData,
  DemoRequestReceivedData,
  EmailClientConfig,
  EmailProviderName,
  EmailRecipient,
  EmailTemplate,
  EmailTemplateData,
  RenderedEmail,
  SendEmailInput,
  SendEmailResult,
} from "./types";
