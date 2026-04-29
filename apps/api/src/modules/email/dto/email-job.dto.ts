import type {
  EmailRecipient,
  EmailTemplateData,
} from "@supkeys/email";

export interface EmailJobContext {
  type: string;
  id: string;
}

/**
 * BullMQ job payload — kuyruğa giren tek bir e-posta isteği.
 * `templateData` discriminated union (template + data) — render aşamasında ayrıştırılır.
 */
export interface EmailJobPayload {
  to: EmailRecipient;
  templateData: EmailTemplateData;
  context?: EmailJobContext;
  /** EmailLog satırının id'si — processor send sonrası bu satırı günceller */
  emailLogId: string;
}

export const EMAIL_QUEUE_NAME = "email";
export const EMAIL_JOB_NAME = "send";
