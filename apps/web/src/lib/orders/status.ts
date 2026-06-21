import type { OrderStatus } from "@/lib/tenders/types";

interface StatusMeta {
  label: string;
  pillClass: string;
  dotClass: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING: {
    label: "Onay Bekliyor",
    pillClass: "bg-warning-50 text-warning-700 border border-warning-200",
    dotClass: "bg-warning-500",
  },
  ACCEPTED: {
    label: "Onaylandı",
    pillClass: "bg-brand-50 text-brand-700 border border-brand-200",
    dotClass: "bg-brand-500",
  },
  IN_DELIVERY: {
    label: "Gönderildi",
    pillClass: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    dotClass: "bg-indigo-500",
  },
  COMPLETED: {
    label: "Tamamlandı",
    pillClass: "bg-success-50 text-success-700 border border-success-200",
    dotClass: "bg-success-500",
  },
  REJECTED: {
    label: "Reddedildi",
    pillClass: "bg-orange-50 text-orange-700 border border-orange-200",
    dotClass: "bg-orange-500",
  },
  CANCELLED: {
    label: "İptal Edildi",
    pillClass: "bg-danger-50 text-danger-700 border border-danger-200",
    dotClass: "bg-danger-500",
  },
  // Faz 3 madde 16 — teslim alındı, ödeme bekleniyor (AFTER_DELIVERY akışı).
  DELIVERED: {
    label: "Ödeme Bekleniyor",
    pillClass: "bg-amber-50 text-amber-700 border border-amber-200",
    dotClass: "bg-amber-500",
  },
  // Legacy statü — yeni akışta üretilmiyor, eski kayıtlar için render fallback.
  IN_PROGRESS: {
    label: "Üretimde",
    pillClass: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    dotClass: "bg-indigo-500",
  },
};

/**
 * Filter dropdown ve liste UI için kullanılan ana statü seti.
 * 4 aşamalı akış: PENDING → ACCEPTED → IN_DELIVERY → COMPLETED;
 * REJECTED/CANCELLED yan dalları.
 */
export const V15_ORDER_STATUS_OPTIONS: Array<{
  value: OrderStatus;
  label: string;
}> = [
  { value: "PENDING", label: "Onay Bekliyor" },
  { value: "ACCEPTED", label: "Onaylandı" },
  { value: "IN_DELIVERY", label: "Gönderildi" },
  { value: "DELIVERED", label: "Ödeme Bekleniyor" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal Edildi" },
];
