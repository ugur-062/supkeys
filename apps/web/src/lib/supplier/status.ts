import type { SupplierRelationStatus } from "@/lib/supplier-auth/types";

interface BadgeMeta {
  label: string;
  badgeClass: string;
}

export const SUPPLIER_RELATION_STATUS_META: Record<
  SupplierRelationStatus,
  BadgeMeta
> = {
  ACTIVE: {
    label: "Aktif",
    badgeClass: "bg-success-50 text-success-600 border-success-500/30",
  },
  PENDING_TENANT_APPROVAL: {
    label: "Onay Bekliyor",
    badgeClass: "bg-warning-50 text-warning-600 border-warning-500/30",
  },
  BLOCKED: {
    label: "Engellendi",
    badgeClass: "bg-danger-50 text-danger-600 border-danger-500/30",
  },
};
