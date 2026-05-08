import type { OrderStatus } from "@/lib/tenders/types";

interface StatusMeta {
  label: string;
  pillClass: string;
  dotClass: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING: {
    label: "Bekliyor",
    pillClass: "bg-warning-50 text-warning-700 border border-warning-200",
    dotClass: "bg-warning-500",
  },
  IN_DELIVERY: {
    label: "Teslimatta",
    pillClass: "bg-blue-50 text-blue-700 border border-blue-200",
    dotClass: "bg-blue-500",
  },
  // V1.5'te bu 3 durum üretilmiyor; eski kayıtlar varsa render edebilmek için bırakıldı.
  ACCEPTED: {
    label: "Kabul Edildi",
    pillClass: "bg-brand-50 text-brand-700 border border-brand-200",
    dotClass: "bg-brand-500",
  },
  IN_PROGRESS: {
    label: "Üretimde",
    pillClass: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    dotClass: "bg-indigo-500",
  },
  DELIVERED: {
    label: "Teslim Edildi",
    pillClass: "bg-success-50 text-success-700 border border-success-200",
    dotClass: "bg-success-500",
  },
  COMPLETED: {
    label: "Tamamlandı",
    pillClass: "bg-success-50 text-success-700 border border-success-200",
    dotClass: "bg-success-500",
  },
  CANCELLED: {
    label: "İptal Edildi",
    pillClass: "bg-danger-50 text-danger-700 border border-danger-200",
    dotClass: "bg-danger-500",
  },
};

/**
 * V1.5 sipariş yaşam döngüsünde kullanıcılara gösterilen ana statü seti.
 * Filtre dropdown ve listeleme için kullanılır.
 */
export const V15_ORDER_STATUS_OPTIONS: Array<{
  value: OrderStatus;
  label: string;
}> = [
  { value: "PENDING", label: "Bekliyor" },
  { value: "IN_DELIVERY", label: "Teslimatta" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "İptal Edildi" },
];
