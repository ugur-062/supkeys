export type EmailLogStatus = "QUEUED" | "SENDING" | "SENT" | "FAILED";

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
