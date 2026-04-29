import type { DemoRequestStatus } from "./types";

interface StatusMeta {
  label: string;
  /** Pill/badge tailwind sınıfları (background + text + border) */
  badgeClass: string;
}

export const DEMO_REQUEST_STATUS_META: Record<DemoRequestStatus, StatusMeta> = {
  NEW: {
    label: "Yeni",
    badgeClass: "bg-brand-100 text-brand-700 border-brand-200",
  },
  CONTACTED: {
    label: "İletişime geçildi",
    badgeClass: "bg-warning-50 text-warning-600 border-warning-500/30",
  },
  DEMO_SCHEDULED: {
    label: "Demo planlandı",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  DEMO_DONE: {
    label: "Demo yapıldı",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  WON: {
    label: "Kazanıldı",
    badgeClass: "bg-success-50 text-success-600 border-success-500/30",
  },
  LOST: {
    label: "Kaybedildi",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-300",
  },
  SPAM: {
    label: "Spam",
    badgeClass: "bg-danger-50 text-danger-600 border-danger-500/30",
  },
};

export const DEMO_REQUEST_STATUS_ORDER: DemoRequestStatus[] = [
  "NEW",
  "CONTACTED",
  "DEMO_SCHEDULED",
  "DEMO_DONE",
  "WON",
  "LOST",
  "SPAM",
];

export const CLOSED_STATUSES: DemoRequestStatus[] = ["WON", "LOST", "SPAM"];

export function isClosedStatus(status: DemoRequestStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}
