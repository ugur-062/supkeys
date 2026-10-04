export { EmailClient, createEmailClient } from "./client";
export { BaseEmailProvider } from "./providers/base";
export { ResendProvider } from "./providers/resend";
export { renderEmail } from "./render";
export { inviteFromName } from "./templates/tender-external-invite";
export { splitSentences } from "./templates/_components/text";
export type { EmailEnv } from "./templates/_components/email-env";
export type {
  EmailClientConfig,
  EmailProviderName,
  EmailRecipient,
  EmailTemplate,
  EmailTemplateData,
  NotificationCode,
  NotificationData,
  NotificationEntry,
  NotificationInfoRow,
  PasswordResetData,
  ReferralInviteData,
  RenderedEmail,
  SendEmailInput,
  SendEmailResult,
  TenderExternalInviteData,
  TenderExternalInviteItem,
  TenderInviteDigestData,
  TenderInviteDigestEntry,
} from "./types";
