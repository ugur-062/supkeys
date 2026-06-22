import { supplierApi } from "@/lib/supplier-auth/api";
import { useMutation } from "@tanstack/react-query";

/** Madde 29 — FAZ 2 onboarding payload'u (tedarikçi). */
export interface SupplierOnboardingPayload {
  legalName: string;
  companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
  taxNumber: string;
  taxOffice: string;
  city: string;
  district: string;
  neighborhood: string;
  postalCode: string;
  addressLine: string;
  billingTitle?: string;
  billingEmail?: string;
  authorizedTckn: string;
  authorizedTitle: string;
  /** UNSPSC segment ID'leri (1-3, ilk = ana sektör). */
  categoryIds: string[];
}

export function useCompleteSupplierOnboarding() {
  return useMutation({
    mutationFn: (dto: SupplierOnboardingPayload) =>
      supplierApi
        .put("/supplier-self-service/onboarding", dto)
        .then((r) => r.data),
  });
}

/** Madde 29 — FAZ 3.1 kurumsal kimlik (panel-içi editlenebilir alanlar). */
export interface CorporateIdentityPayload {
  mersisNo?: string;
  tradeRegistryNo?: string;
  kepAddress?: string;
  iban?: string;
  ibanHolder?: string;
}

export function useUpdateSupplierCorporateIdentity() {
  return useMutation({
    mutationFn: (dto: CorporateIdentityPayload) =>
      supplierApi
        .put("/supplier-self-service/corporate-identity", dto)
        .then((r) => r.data),
  });
}
