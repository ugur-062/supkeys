import type { CompanyType } from "./types";

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

export const REJECTION_REASONS = [
  "Şirket bilgileri doğrulanamadı",
  "Vergi numarası geçersiz",
  "Vergi levhası uygun değil",
  "Sektör hizmet kapsamımız dışında",
] as const;
