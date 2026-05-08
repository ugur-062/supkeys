import type {
  ApprovalFlowStatus,
  ApprovalFlowType,
} from "./types";

export interface ApprovalFlowTypeMeta {
  label: string;
  description: string;
  pillClass: string;
}

export const APPROVAL_FLOW_TYPE_META: Record<
  ApprovalFlowType,
  ApprovalFlowTypeMeta
> = {
  TENDER_PUBLISH: {
    label: "İhale Onayı",
    description: "İhalelerinizin yayınlama sürecini etkiler.",
    pillClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  TENDER_AWARD: {
    label: "Kazanan Onayı",
    description: "İhalelerinizdeki kazanan belirleme sürecini etkiler.",
    pillClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
};

/**
 * Step 1 wizard'ında 4'lü grid: TENDER_PUBLISH/TENDER_AWARD aktif,
 * ORDER/PURCHASE_REQUEST disabled placeholder ("YAKINDA · V2").
 */
export const APPROVAL_FLOW_TYPE_OPTIONS = [
  {
    value: "TENDER_PUBLISH" as ApprovalFlowType,
    label: APPROVAL_FLOW_TYPE_META.TENDER_PUBLISH.label,
    description: APPROVAL_FLOW_TYPE_META.TENDER_PUBLISH.description,
    available: true,
  },
  {
    value: "TENDER_AWARD" as ApprovalFlowType,
    label: APPROVAL_FLOW_TYPE_META.TENDER_AWARD.label,
    description: APPROVAL_FLOW_TYPE_META.TENDER_AWARD.description,
    available: true,
  },
  {
    value: "ORDER" as const,
    label: "Sipariş Onayı",
    description: "İhalelerden çıkacak siparişlerin onay sürecini etkiler.",
    available: false,
  },
  {
    value: "PURCHASE_REQUEST" as const,
    label: "Talep Onayı",
    description: "Firmanızda oluşturulan taleplerin statüsünü etkiler.",
    available: false,
  },
];

export interface ApprovalFlowStatusMeta {
  label: string;
  pillClass: string;
  dotClass: string;
}

export const APPROVAL_FLOW_STATUS_META: Record<
  ApprovalFlowStatus,
  ApprovalFlowStatusMeta
> = {
  DRAFT: {
    label: "Taslak",
    pillClass: "bg-warning-50 text-warning-700 border-warning-200",
    dotClass: "bg-warning-500",
  },
  ACTIVE: {
    label: "Aktif",
    pillClass: "bg-success-50 text-success-700 border-success-200",
    dotClass: "bg-success-500",
  },
  PASSIVE: {
    label: "Pasif",
    pillClass: "bg-slate-100 text-slate-700 border-slate-200",
    dotClass: "bg-slate-400",
  },
};

export function flowTypeLabel(type: ApprovalFlowType): string {
  return APPROVAL_FLOW_TYPE_META[type]?.label ?? type;
}

export function flowStatusLabel(status: ApprovalFlowStatus): string {
  return APPROVAL_FLOW_STATUS_META[status]?.label ?? status;
}

/** TR para gösterimi (Step diagram + summary için) */
export function formatAmountTR(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "—";
  try {
    return num.toLocaleString("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
      maximumFractionDigits: 0,
    });
  } catch {
    return `${num.toLocaleString("tr-TR")} ${currency || "TRY"}`;
  }
}
