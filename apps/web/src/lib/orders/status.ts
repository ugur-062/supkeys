import type { OrderStatus } from "@/lib/tenders/types";

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; pillClass: string }
> = {
  PENDING: {
    label: "Bekliyor",
    pillClass: "bg-warning-50 text-warning-700 border-warning-200",
  },
  ACCEPTED: {
    label: "Kabul Edildi",
    pillClass: "bg-brand-50 text-brand-700 border-brand-200",
  },
  IN_PROGRESS: {
    label: "Üretimde",
    pillClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  DELIVERED: {
    label: "Teslim Edildi",
    pillClass: "bg-success-50 text-success-700 border-success-200",
  },
  COMPLETED: {
    label: "Tamamlandı",
    pillClass: "bg-success-100 text-success-800 border-success-300",
  },
  CANCELLED: {
    label: "İptal",
    pillClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
};
