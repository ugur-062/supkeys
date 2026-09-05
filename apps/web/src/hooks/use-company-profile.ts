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
  /** Ziyaretlerim karşı tarafa görünsün (Ziyaret Edenler) — varsayılan açık. */
  visitsVisible: boolean;
  logoUrl: string | null;
  coverImageUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  employeeCount: string | null;
  foundedYear: number | null;
  services: string[];
  certifications: string[];
  photos: string[];
  certificateImages: string[];
  buyerCategoryIds: string[];
  sellerCategoryIds: string[];
  /** ALT kategoriler (level 2-4) — ana kategoriden AYRI eksen. */
  buyerSubCategoryIds: string[];
  sellerSubCategoryIds: string[];
  /** Faaliyet tipi (çoklu) — üretici / bayi / hizmet / dış ticaret / fason. */
  activities: string[];
  taxNumber: string | null;
  taxOffice: string | null;
  companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR" | null;
  authorizedTckn: string | null;
  authorizedTitle: string | null;
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  kepAddress: string | null;
  iban: string | null;
  ibanHolder: string | null;
  billingPhone: string | null;
  billingPhoneVerifiedAt: string | null;
  rothernId: string | null;
  slug: string | null;
  tier: "STANDART" | "BRONZ" | "SILVER" | "GOLD";
  companyVerificationStatus: string;
  onboardingCompletedAt: string | null;
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
    | "visitsVisible"
    | "logoUrl"
    | "coverImageUrl"
    | "linkedinUrl"
    | "instagramUrl"
    | "employeeCount"
    | "foundedYear"
    | "services"
    | "certifications"
    | "photos"
    | "certificateImages"
    | "buyerCategoryIds"
    | "sellerCategoryIds"
    | "buyerSubCategoryIds"
    | "sellerSubCategoryIds"
    | "activities"
    | "mersisNo"
    | "tradeRegistryNo"
    | "kepAddress"
    | "iban"
    | "ibanHolder"
  >
>;

/**
 * Logo/kapak yükleme — presigned PUT ile doğrudan R2'ye. URL döner; çağıran
 * onu forma koyar, Kaydet'te kalıcılaşır (DB'ye burada yazılmaz).
 */
export function useUploadProfileImage() {
  return useMutation({
    mutationFn: async ({
      file,
      kind,
    }: {
      file: File;
      kind: "logo" | "cover" | "gallery";
    }): Promise<string> => {
      const { data } = await companyApi.post<{ url: string; key: string }>(
        "/company/profile/image/upload-url",
        { kind, fileName: file.name, mimeType: file.type },
      );
      const put = await fetch(data.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Dosya yüklenemedi (R2)");
      const { data: res } = await companyApi.post<{ url: string }>(
        "/company/profile/image/commit",
        { kind, key: data.key },
      );
      return res.url;
    },
  });
}

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
