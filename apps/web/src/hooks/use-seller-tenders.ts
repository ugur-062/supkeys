"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

/** GET /company/listings/seller-tenders satırı. */
export interface SellerTenderRow {
  id: string;
  number: string | null;
  title: string;
  status: string;
  visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE";
  format: string | null;
  currency: string;
  isInternational: boolean;
  closesAt: string | null;
  createdAt: string;
  itemCount: number;
  owner: { id: string; name: string } | null;
  masked: boolean;
  canBid: boolean;
  invited: boolean;
  myBidStatus: string | null;
  myBidVersion: number | null;
  categoryMatch: boolean;
  categories: { code: string; name: string }[];
  extraCategoryCount: number;
  /** SATIS fiyatlandırma kapsamı (TOPLU/KALEM). */
  priceScope?: "TOPLU" | "KALEM" | null;
  /** SATIS ilanlarında taban + hemen-al (maskelide null). */
  minPrice: string | null;
  buyNowPrice: string | null;
}

export function useSellerTenders(type: "ALIM" | "SATIS" = "ALIM") {
  return useQuery<SellerTenderRow[]>({
    queryKey: ["company-listings", "seller-tenders", type],
    queryFn: async () => {
      const { data } = await companyApi.get<SellerTenderRow[]>(
        `/company/listings/seller-tenders?type=${type}`,
      );
      return data;
    },
    staleTime: 10_000,
    refetchInterval: 15_000, // canlı liste — teklif durumu/kapanış tazelensin
    refetchOnWindowFocus: true,
  });
}
