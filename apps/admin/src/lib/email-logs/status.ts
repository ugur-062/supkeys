import type { EmailLogStatus } from "./types";

interface StatusMeta {
  label: string;
  badgeClass: string;
}

export const EMAIL_STATUS_META: Record<EmailLogStatus, StatusMeta> = {
  QUEUED: {
    label: "Kuyrukta",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-300",
  },
  SENDING: {
    label: "Gönderiliyor",
    badgeClass: "bg-brand-100 text-brand-700 border-brand-200",
  },
  SENT: {
    label: "Gönderildi",
    badgeClass: "bg-success-50 text-success-600 border-success-500/30",
  },
  FAILED: {
    label: "Başarısız",
    badgeClass: "bg-danger-50 text-danger-600 border-danger-500/30",
  },
};

export const EMAIL_STATUS_ORDER: EmailLogStatus[] = [
  "QUEUED",
  "SENDING",
  "SENT",
  "FAILED",
];

export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  demo_request_received: "Demo talep — kullanıcı teşekkür",
  demo_request_admin_alert: "Demo talep — admin bildirim",
};

export function getTemplateLabel(template: string): string {
  return EMAIL_TEMPLATE_LABELS[template] ?? template;
}
