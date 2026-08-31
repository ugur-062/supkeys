"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export type DirectoryConnectionStatus =
  | "none"
  | "pending"
  | "incoming"
  | "active"
  | "self";

export interface DirectoryCompany {
  rothernId: string | null;
  slug: string | null;
  name: string;
  industry: string | null;
  city: string | null;
  logoUrl: string | null;
  connectionStatus: DirectoryConnectionStatus;
}

/**
 * Perf turu (denetim P10): `enabled` eklendi — dizin araması yalnız Keşfet
 * sekmesi açıkken anlamlı. Eskiden sayfa açılışında boş `q` ile de koşup
 * tüm dizini çekiyordu.
 */
export function useCompanySearch(q: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["company-directory", "search", q],
    queryFn: async () => {
      const { data } = await companyApi.get<DirectoryCompany[]>(
        "/company/directory/search",
        { params: q ? { q } : {} },
      );
      return data;
    },
    // Yazarken (q değişince) önceki sonuçlar ekranda kalsın — her tuşta
    // skeleton'a flaş atmaz.
    placeholderData: (prev) => prev,
  });
}

export interface ProfileListing {
  id: string;
  number: string | null;
  type: "ALIM" | "SATIS";
  format: "RFQ" | "ENGLISH_AUCTION" | null;
  title: string;
  status: string;
  createdAt: string;
  closesAt: string | null;
}

export interface CompanyProfile {
  profile: {
    rothernId: string | null;
    slug: string | null;
    name: string;
    /** Faz T: "Gold Üye" rozeti. */
    goldMember?: boolean;
    industry: string | null;
    city: string | null;
    country: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
    aboutText: string | null;
    services: string[];
    certifications: string[];
    photos: string[];
    certificateImages: string[];
    foundedYear: number | null;
    employeeCount: string | null;
    website: string | null;
    linkedinUrl: string | null;
    instagramUrl: string | null;
    rating: { avg: number; count: number } | null;
  };
  connectionStatus: DirectoryConnectionStatus;
  connectionId: string | null;
  connected: boolean;
  listings: ProfileListing[];
}

export function useCompanyProfile(rothernId: string) {
  return useQuery({
    queryKey: ["company-directory", "profile", rothernId],
    enabled: !!rothernId,
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyProfile>(
        `/company/directory/companies/${rothernId}`,
      );
      return data;
    },
  });
}
