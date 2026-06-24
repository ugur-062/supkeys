import { supplierApi } from "@/lib/supplier-auth/api";
import { useMutation } from "@tanstack/react-query";

/** Madde 29 — FAZ 2 onboarding payload'u (tedarikçi). */
export interface SupplierOnboardingPayload {
  legalName: string;
  companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
  /** ISO 3166-1 alpha-2 (TR varsayılan). */
  country: string;
  taxNumber: string;
  taxOffice?: string;
  city: string;
  district?: string;
  stateRegion?: string;
  neighborhood?: string;
  postalCode?: string;
  addressLine: string;
  billingTitle?: string;
  billingEmail?: string;
  // Teslimat adresi ("fatura adresimle aynı" tiki).
  deliveryUseBilling: boolean;
  deliveryCity?: string;
  deliveryDistrict?: string;
  deliveryNeighborhood?: string;
  deliveryPostalCode?: string;
  deliveryAddressLine?: string;
  authorizedTckn?: string;
  /** Yetkilinin rolü → isManager. */
  role: "MANAGER" | "PURCHASER";
  /** UNSPSC ana kategoriler (segment, ≤3) + alt kategoriler (sınırsız). */
  mainCategoryIds: string[];
  subCategoryIds: string[];
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
