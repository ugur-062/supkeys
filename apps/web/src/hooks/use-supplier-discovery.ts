"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation } from "@tanstack/react-query";

export interface DiscoveryCandidate {
  companyId: string;
  name: string;
  city: string | null;
  rothernId: string | null;
  matchedCategories: string[];
  strongMatch: boolean;
  connectionStatus: "NONE" | "PENDING";
}

/** Faz A — dizinden kategori-eşleşmeli, bağlantısız tedarikçi adayları. */
export function useSupplierDiscovery() {
  return useMutation({
    mutationFn: async (input: {
      type: "ALIM" | "SATIS";
      categoryIds: string[];
    }) => {
      const { data } = await companyApi.post<{ candidates: DiscoveryCandidate[] }>(
        "/company/ai/supplier-discovery",
        input,
      );
      return data.candidates;
    },
  });
}
