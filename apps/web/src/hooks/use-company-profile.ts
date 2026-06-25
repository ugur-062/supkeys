"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CompanyProfile {
  id: string;
  name: string;
  legalName: string | null;
  industry: string | null;
  website: string | null;
  country: string;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  postalCode: string | null;
  aboutText: string | null;
  publicEnabled: boolean;
  taxNumber: string | null;
  supkeysId: string | null;
  tier: "STANDARD" | "PAKET";
  companyVerificationStatus: string;
}

export type CompanyProfileUpdate = Partial<
  Pick<
    CompanyProfile,
    | "name"
    | "legalName"
    | "industry"
    | "website"
    | "city"
    | "district"
    | "addressLine"
    | "postalCode"
    | "aboutText"
    | "publicEnabled"
  >
>;

export function useCompanyProfile() {
  return useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyProfile>("/company/profile");
      return data;
    },
  });
}

export function useUpdateCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompanyProfileUpdate) => {
      const { data } = await companyApi.patch<CompanyProfile>(
        "/company/profile",
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-profile"] });
      qc.invalidateQueries({ queryKey: ["company-auth", "me"] });
    },
  });
}
