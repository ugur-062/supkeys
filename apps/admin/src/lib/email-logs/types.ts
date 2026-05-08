export type EmailLogStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  // V2-1 — Resend webhook tracking
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "BOUNCED"
  | "COMPLAINED"
  | "FAILED";

export type EmailEventType =
  | "SENT"
  | "DELIVERED"
  | "DELIVERY_DELAYED"
  | "BOUNCED"
  | "COMPLAINED"
  | "OPENED"
  | "CLICKED"
  | "FAILED";

export interface EmailEvent {
  id: string;
  eventId: string;
  eventType: EmailEventType;
  occurredAt: string;
  payload: unknown;
  clickedUrl: string | null;
  bounceType: string | null;
  bounceReason: string | null;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  template: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  provider: string;
  providerMessageId: string | null;
  status: EmailLogStatus;
  errorMessage: string | null;
  payload: unknown;
  attemptCount: number;
  queuedAt: string;
  sentAt: string | null;
  failedAt: string | null;
  contextType: string | null;
  contextId: string | null;
  /** V2-1 — Resend webhook delivery tracking */
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  bounceType: string | null;
  bounceReason: string | null;
  complainedAt: string | null;
  /** Detail endpoint'ten gelir; list'te yok. */
  events?: EmailEvent[];
}

export interface EmailLogPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface EmailLogList {
  items: EmailLog[];
  pagination: EmailLogPagination;
}

export interface ListEmailLogsParams {
  status?: EmailLogStatus;
  template?: string;
  toEmail?: string;
  contextType?: string;
  contextId?: string;
  page?: number;
  pageSize?: number;
}
