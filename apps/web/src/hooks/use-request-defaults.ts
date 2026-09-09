"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { RequestDefaults, RequestDefaultsResponse } from "@rothern/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const REQUEST_DEFAULTS_KEY = ["company-request-defaults"] as const;

/** Talep şartları (ticari profil) — `GET company/request-defaults`. */
export function useRequestDefaults(enabled = true) {
  return useQuery({
    enabled,
    queryKey: REQUEST_DEFAULTS_KEY,
    queryFn: async () => {
      const { data } = await companyApi.get<RequestDefaultsResponse>("/company/request-defaults");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveRequestDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RequestDefaults) => {
      const { data } = await companyApi.put<RequestDefaultsResponse>("/company/request-defaults", input);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(REQUEST_DEFAULTS_KEY, data);
    },
  });
}
