import type {
  ApprovalFlowType,
  ApprovalRequestStatus,
  ApprovalStepStatus,
} from "./types";

export const APPROVAL_REQUEST_STATUS_META: Record<
  ApprovalRequestStatus,
  { label: string; pillClass: string; dotClass: string }
> = {
  PENDING: {
    label: "Bekliyor",
    pillClass:
      "bg-warning-50 text-warning-700 border border-warning-200",
    dotClass: "bg-warning-500",
  },
  APPROVED: {
    label: "Onaylandı",
    pillClass:
      "bg-success-50 text-success-700 border border-success-200",
    dotClass: "bg-success-500",
  },
  REJECTED: {
    label: "Reddedildi",
    pillClass:
      "bg-danger-50 text-danger-700 border border-danger-200",
    dotClass: "bg-danger-500",
  },
  CANCELLED: {
    label: "İptal Edildi",
    pillClass: "bg-slate-100 text-slate-600 border border-slate-200",
    dotClass: "bg-slate-400",
  },
};

export const APPROVAL_STEP_STATUS_META: Record<
  ApprovalStepStatus,
  { label: string; pillClass: string }
> = {
  WAITING: {
    label: "Sırada",
    pillClass: "bg-slate-100 text-slate-600 border border-slate-200",
  },
  PENDING: {
    label: "Onayınızı bekliyor",
    pillClass:
      "bg-warning-50 text-warning-700 border border-warning-200",
  },
  APPROVED: {
    label: "Onayladı",
    pillClass:
      "bg-success-50 text-success-700 border border-success-200",
  },
  REJECTED: {
    label: "Reddetti",
    pillClass:
      "bg-danger-50 text-danger-700 border border-danger-200",
  },
  SKIPPED: {
    label: "Atlandı",
    pillClass:
      "bg-slate-50 text-slate-500 border border-slate-200 italic",
  },
};

export const APPROVAL_TYPE_LABEL: Record<ApprovalFlowType, string> = {
  TENDER_PUBLISH: "İhale Onayı",
  TENDER_AWARD: "Kazanan Onayı",
};

export const APPROVAL_TYPE_PILL_CLASS: Record<ApprovalFlowType, string> = {
  TENDER_PUBLISH: "bg-purple-50 text-purple-700 border border-purple-200",
  TENDER_AWARD: "bg-indigo-50 text-indigo-700 border border-indigo-200",
};

export function formatAmountTR(amount: string | number, currency: string) {
  const num = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(num)) return `${amount} ${currency}`;
  try {
    return num.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${num.toLocaleString("tr-TR")} ${currency}`;
  }
}
