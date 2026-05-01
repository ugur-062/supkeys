import type { InvitationStatus, RelationStatus } from "./types";

interface BadgeMeta {
  label: string;
  badgeClass: string;
}

export const RELATION_STATUS_META: Record<RelationStatus, BadgeMeta> = {
  ACTIVE: {
    label: "Aktif",
    badgeClass: "bg-success-50 text-success-600 border-success-500/30",
  },
  PENDING_TENANT_APPROVAL: {
    label: "Onay Bekliyor",
    badgeClass: "bg-warning-50 text-warning-600 border-warning-500/30",
  },
  BLOCKED: {
    label: "Engelli",
    badgeClass: "bg-danger-50 text-danger-600 border-danger-500/30",
  },
};

export const INVITATION_STATUS_META: Record<InvitationStatus, BadgeMeta> = {
  PENDING: {
    label: "Bekliyor",
    badgeClass: "bg-warning-50 text-warning-600 border-warning-500/30",
  },
  ACCEPTED: {
    label: "Kabul Edildi",
    badgeClass: "bg-success-50 text-success-600 border-success-500/30",
  },
  EXPIRED: {
    label: "Süresi Doldu",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-300",
  },
  CANCELLED: {
    label: "İptal Edildi",
    badgeClass: "bg-danger-50 text-danger-600 border-danger-500/30",
  },
};

export const INVITATION_STATUS_ORDER: InvitationStatus[] = [
  "PENDING",
  "ACCEPTED",
  "EXPIRED",
  "CANCELLED",
];
