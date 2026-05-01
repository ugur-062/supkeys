import type { CompanyType, SupplierMembership } from "./types";

interface BadgeMeta {
  label: string;
  badgeClass: string;
}

export const MEMBERSHIP_META: Record<SupplierMembership, BadgeMeta> = {
  STANDARD: {
    label: "Standart",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
  },
  PREMIUM: {
    label: "Premium",
    badgeClass: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
};

export const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  JOINT_STOCK: "Anonim Şirketi (A.Ş.)",
  LIMITED: "Limited Şirketi (Ltd. Şti.)",
  SOLE_PROPRIETOR: "Şahıs Şirketi",
};

export const COMPANY_TYPE_SHORT_LABEL: Record<CompanyType, string> = {
  JOINT_STOCK: "A.Ş.",
  LIMITED: "Ltd. Şti.",
  SOLE_PROPRIETOR: "Şahıs",
};
