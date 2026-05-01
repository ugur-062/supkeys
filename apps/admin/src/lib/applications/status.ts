import type { ApplicationStatus } from "./types";

export interface ApplicationStatusMeta {
  label: string;
  /** Pill/badge tailwind sınıfları (background + text + border) */
  badgeClass: string;
}

export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  ApplicationStatusMeta
> = {
  PENDING_EMAIL_VERIFICATION: {
    label: "E-posta Bekliyor",
    badgeClass: "bg-warning-50 text-warning-600 border-warning-500/30",
  },
  PENDING_REVIEW: {
    label: "İncelemede",
    badgeClass: "bg-brand-50 text-brand-700 border-brand-200",
  },
  APPROVED: {
    label: "Onaylandı",
    badgeClass: "bg-success-50 text-success-600 border-success-500/30",
  },
  REJECTED: {
    label: "Reddedildi",
    badgeClass: "bg-danger-50 text-danger-600 border-danger-500/30",
  },
};

export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  "PENDING_EMAIL_VERIFICATION",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
];
