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
  type: "ALIM";
  format: ListingFormat | null;
  status: ListingStatus;
  isInternational: boolean;
  categoryIds: string[];
  /** İlk 2 kategori adı (Kategori kolonu) + kalan sayaç. */
  categories: { code: string; name: string }[];
  extraCategoryCount: number;
  createdById: string;
  createdBy: { firstName: string; lastName: string };
  invitationCount: number;
  bidCount: number;
  publishedAt: string | null;
  bidsCloseAt: string | null;
  createdAt: string;
}

/** Taleplerim — zengin liste; filtre/sıralama frontend'de. */
export function useTenders() {
  return useQuery<TenderListItem[]>({
    queryKey: ["company-tenders", "ALIM"],
    queryFn: async () => {
      const { data } = await companyApi.get<TenderListItem[]>(
        "/company/listings/tenders?type=ALIM",
      );
      return data;
    },
    // Gelen yeni teklif/davet sayaçları yenilemeden görünsün.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}
