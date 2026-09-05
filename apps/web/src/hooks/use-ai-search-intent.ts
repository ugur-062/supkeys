"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { AiSearchIntentResult, AiSearchPortal } from "@rothern/shared";
import { useMutation } from "@tanstack/react-query";

/** AI ile ara — doğal dil → süzgeç (`POST company/ai/search-intent`, Silver+). */
export function useAiSearchIntent() {
  return useMutation({
    mutationFn: async (input: { text: string; portal: AiSearchPortal }) => {
      const { data } = await companyApi.post<AiSearchIntentResult>(
        "/company/ai/search-intent",
        input,
        { timeout: 60_000 },
      );
      return data;
    },
  });
}
