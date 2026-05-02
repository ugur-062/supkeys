import type {
  CompanyType,
  SupplierMembership,
} from "@/lib/supplier-auth/types";

export const MEMBERSHIP_LABEL: Record<SupplierMembership, string> = {
  STANDARD: "Standart",
  PREMIUM: "Premium",
};

export const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  JOINT_STOCK: "Anonim Şirketi (A.Ş.)",
  LIMITED: "Limited Şirketi (Ltd. Şti.)",
  SOLE_PROPRIETOR: "Şahıs Şirketi",
};
