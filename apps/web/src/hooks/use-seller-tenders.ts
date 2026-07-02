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
  owner: { name: string } | null;
  masked: boolean;
  canBid: boolean;
  invited: boolean;
  myBidStatus: string | null;
  myBidVersion: number | null;
  categoryMatch: boolean;
  categories: { code: string; name: string }[];
  extraCategoryCount: number;
}

export function useSellerTenders() {
  return useQuery<SellerTenderRow[]>({
    queryKey: ["company-listings", "seller-tenders"],
    queryFn: async () => {
      const { data } = await companyApi.get<SellerTenderRow[]>(
        "/company/listings/seller-tenders",
      );
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 30_000, // eski panel 30sn poll paritesi
  });
}
