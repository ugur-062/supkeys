"use client";

import { companyApi } from "@/lib/company-auth/api";
import type {
  ProductIndexCard,
  PublicDirectoryCard,
  PublicDirectoryFacets,
} from "@/lib/public/marketplace-api";
import type { ReviewSummary } from "@rothern/shared";
import { useQuery } from "@tanstack/react-query";

export type DirectoryConnectionStatus =
  | "none"
  | "pending"
  | "incoming"
  | "active"
  | "self";

/**
 * Dizin kartı — herkese açık `/firmalar` kartıyla AYNI şekil (tek kaynak API
 * `buildDirectory`) + üyeye Rothern ID ve bağlantı durumu.
 */
export interface DirectoryCompany extends PublicDirectoryCard {
  rothernId: string | null;
  connectionStatus: DirectoryConnectionStatus;
}

export interface DirectorySearchParams {
  q?: string;
  city?: string;
  category?: string;
  activity?: string;
  verified?: boolean;
  hasProducts?: boolean;
  page?: number;
}

/**
 * Dizin araması — görmek ÜCRETSİZ (2026-09-04); süzgeçler public ile aynı.
 * `enabled`: yalnız Keşfet sekmesi açıkken (perf P10).
 */
export function useCompanySearch(params: DirectorySearchParams, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["company-directory", "search", params],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.q) sp.set("q", params.q);
      if (params.city) sp.set("city", params.city);
      if (params.category) sp.set("category", params.category);
      if (params.activity) sp.set("activity", params.activity);
      if (params.verified) sp.set("verified", "1");
      if (params.hasProducts) sp.set("hasProducts", "1");
      if (params.page && params.page > 1) sp.set("page", String(params.page));
      const qs = sp.toString();
      const { data } = await companyApi.get<{ items: DirectoryCompany[]; total: number; page: number; pageSize: number }>(
        `/company/directory/search${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    // Yazarken (q değişince) önceki sonuçlar ekranda kalsın.
    placeholderData: (prev) => prev,
  });
}

export function useCompanySearchFacets(enabled = true) {
  return useQuery<PublicDirectoryFacets>({
    enabled,
    queryKey: ["company-directory", "search-facets"],
    queryFn: async () => {
      const { data } = await companyApi.get<PublicDirectoryFacets>("/company/directory/search/facets");
      return data;
    },
    staleTime: 300_000,
  });
}

export interface ProfileListing {
  id: string;
  number: string | null;
  type: "ALIM";
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
    verified?: boolean;
    activities?: string[];
    categories?: { id: string; name: string }[];
    reviewSummary?: ReviewSummary | null;
    trade?: {
      legalName: string | null;
      taxNumber: string | null;
      taxOffice: string | null;
      mersisNo: string | null;
      tradeRegistryNo: string | null;
      kepAddress: string | null;
    } | null;
  };
  connectionStatus: DirectoryConnectionStatus;
  connectionId: string | null;
  connected: boolean;
  listings: ProfileListing[];
  /** Herkese açık profildeki ızgarayla aynı kapı ve sıra; üye fiyatı görür. */
  products: ProductIndexCard[];
  productCount: number;
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
