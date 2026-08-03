import type { EmailEventType, EmailLogStatus } from "./types";

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
    badgeClass: "bg-zinc-100 text-zinc-800 border-zinc-300",
  },
  SENT: {
    label: "Gönderildi",
    badgeClass: "bg-zinc-50 text-zinc-600 border-zinc-200",
  },
  // V2-1 — Resend webhook tracking
  DELIVERED: {
    label: "Teslim Edildi",
    badgeClass: "bg-success-50 text-success-700 border-success-200",
  },
  OPENED: {
    label: "Açıldı",
    badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
  CLICKED: {
    label: "Tıklandı",
    badgeClass: "bg-zinc-900 text-white border-zinc-900",
  },
  BOUNCED: {
    label: "Geri Döndü",
    badgeClass: "bg-danger-50 text-danger-700 border-danger-200",
  },
  COMPLAINED: {
    label: "Şikayet",
    badgeClass: "bg-danger-100 text-danger-800 border-danger-300",
  },
  FAILED: {
    label: "Başarısız",
    badgeClass: "bg-warning-50 text-warning-700 border-warning-200",
  },
};

export const EMAIL_STATUS_ORDER: EmailLogStatus[] = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
];

export const EMAIL_EVENT_META: Record<
  EmailEventType,
  { label: string; iconColor: string; iconBg: string; iconBorder: string }
> = {
  SENT: {
    label: "Gönderildi",
    iconColor: "text-zinc-600",
    iconBg: "bg-zinc-100",
    iconBorder: "border-zinc-200",
  },
  DELIVERED: {
    label: "Teslim Edildi",
    iconColor: "text-success-600",
    iconBg: "bg-success-50",
    iconBorder: "border-success-200",
  },
  DELIVERY_DELAYED: {
    label: "Teslim Gecikti",
    iconColor: "text-warning-600",
    iconBg: "bg-warning-50",
    iconBorder: "border-warning-200",
  },
  OPENED: {
    label: "Açıldı",
    iconColor: "text-zinc-700",
    iconBg: "bg-zinc-100",
    iconBorder: "border-zinc-300",
  },
  CLICKED: {
    label: "Tıklandı",
    iconColor: "text-zinc-900",
    iconBg: "bg-zinc-100",
    iconBorder: "border-zinc-400",
  },
  BOUNCED: {
    label: "Geri Döndü",
    iconColor: "text-danger-600",
    iconBg: "bg-danger-50",
    iconBorder: "border-danger-200",
  },
  COMPLAINED: {
    label: "Şikayet Edildi",
    iconColor: "text-danger-700",
    iconBg: "bg-danger-100",
    iconBorder: "border-danger-300",
  },
  FAILED: {
    label: "Başarısız",
    iconColor: "text-warning-600",
    iconBg: "bg-warning-50",
    iconBorder: "border-warning-200",
  },
};

export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  demo_request_received: "Demo talep — kullanıcı teşekkür",
  demo_request_admin_alert: "Demo talep — admin bildirim",
};

export function getTemplateLabel(template: string): string {
  return EMAIL_TEMPLATE_LABELS[template] ?? template;
}
