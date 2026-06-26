"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export type ExchangeRates = Record<string, number>;

interface ExchangeRatesResponse {
  rates: ExchangeRates;
  timestamp: string;
}

/**
 * V2-3 — TCMB kurları. 5 dk cache + refetch. Endpoint public ama company
 * axios instance üzerinden gidiyor (auth header zarar vermiyor).
 */
export function useCurrentExchangeRates() {
  return useQuery<ExchangeRatesResponse>({
    queryKey: ["exchange-rates", "current"],
    queryFn: async () => {
      const { data } = await companyApi.get<ExchangeRatesResponse>(
        "/exchange-rates/current",
      );
      return data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}
