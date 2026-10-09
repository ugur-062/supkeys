export { EmailClient, createEmailClient } from "./client";
export { BaseEmailProvider } from "./providers/base";
export { ResendProvider } from "./providers/resend";
export { PLAIN_LETTER_TEMPLATES, renderEmail } from "./render";
export { PLAIN_LETTER_MAX_LINKS } from "./templates/_components/plain-letter";
export {
  SUBJECT_ITEM_NAME_MAX,
  SUBJECT_MAX_LENGTH,
  inviteFromName,
  subjectName,
  truncateAtWord,
} from "./templates/tender-external-invite";
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
