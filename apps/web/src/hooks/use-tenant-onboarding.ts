import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";

/** Madde 29 — FAZ 2 onboarding payload'u (alıcı/tenant). */
export interface TenantOnboardingPayload {
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

export function useCompleteTenantOnboarding() {
  return useMutation({
    mutationFn: (dto: TenantOnboardingPayload) =>
      api.put("/tenant-onboarding", dto).then((r) => r.data),
  });
}

/** Madde 29 — FAZ 3.1 kurumsal kimlik (panel-içi editlenebilir alanlar). */
export interface TenantCorporateIdentityPayload {
  mersisNo?: string;
  tradeRegistryNo?: string;
  kepAddress?: string;
  iban?: string;
  ibanHolder?: string;
}

export function useUpdateTenantCorporateIdentity() {
  return useMutation({
    mutationFn: (dto: TenantCorporateIdentityPayload) =>
      api.put("/tenant-onboarding/corporate-identity", dto).then((r) => r.data),
  });
}
