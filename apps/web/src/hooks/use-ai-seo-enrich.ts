"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { AiSeoEnrichInput, AiSeoEnrichResult } from "@rothern/shared";
import { useMutation } from "@tanstack/react-query";

/**
 * AI ile açıklama güçlendirme — TASLAK (`POST company/ai/seo-enrich`, Silver+).
 * Sonuç formda ÖNİZLENİR; kullanıcı "Uygula" der, sonra kaydeder. Model
 * hiçbir alanı doğrudan yazmaz (AI çerçevesi kuralı).
 */
export function useAiSeoEnrich() {
  return useMutation({
    mutationFn: async (input: AiSeoEnrichInput) => {
      const { data } = await companyApi.post<AiSeoEnrichResult>("/company/ai/seo-enrich", input, { timeout: 60_000 });
      return data;
    },
  });
}
