"use client";

import type {
  ListingFormat,
  ListingStatus,
} from "@/components/tenders/status-badge";
import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export interface TenderListItem {
  id: string;
  tenderNumber: string;
  title: string;
  type: "ALIM" | "SATIS";
  format: ListingFormat | null;
  status: ListingStatus;
  isInternational: boolean;
  categoryIds: string[];
  createdById: string;
  createdBy: { firstName: string; lastName: string };
  invitationCount: number;
  bidCount: number;
  publishedAt: string | null;
  bidsCloseAt: string | null;
  createdAt: string;
}

/** İhalelerim (ALIM) — zengin liste; filtre/sıralama frontend'de. */
export function useTenders() {
  return useQuery<TenderListItem[]>({
    queryKey: ["company-tenders"],
    queryFn: async () => {
      const { data } = await companyApi.get<TenderListItem[]>(
        "/company/listings/tenders",
      );
      return data;
    },
  });
}
