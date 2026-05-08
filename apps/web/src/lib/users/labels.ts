import type { UserRole } from "@/lib/auth/types";

export interface RoleMeta {
  label: string;
  description: string;
  /** Tailwind tone — pill rendering için */
  pillClass: string;
}

export const USER_ROLE_LABELS: Record<UserRole, RoleMeta> = {
  COMPANY_ADMIN: {
    label: "Firma Yöneticisi",
    description:
      "Tüm yetkiler — kullanıcı yönetimi, ihale, onay, sipariş.",
    pillClass: "bg-brand-50 text-brand-700 border-brand-200",
  },
  BUYER: {
    label: "Satın Almacı",
    description:
      "İhale oluşturabilir, teklifleri yönetebilir, sipariş takibi yapar.",
    pillClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  APPROVER: {
    label: "Onaylayıcı",
    description:
      "Sadece onay süreçlerinde yetkili — ihale oluşturamaz.",
    pillClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

export function roleLabel(role: UserRole): string {
  return USER_ROLE_LABELS[role]?.label ?? role;
}
