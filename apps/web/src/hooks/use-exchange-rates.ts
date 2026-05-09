"use client";

import { api } from "@/lib/api";
import type { Currency } from "@/lib/format-currency";
import { useQuery } from "@tanstack/react-query";

export type ExchangeRates = Record<Currency, number>;

interface ExchangeRatesResponse {
  rates: ExchangeRates;
  timestamp: string;
}

/**
 * V2-3 — Public TCMB kurları. 5 dk cache; auth gerekmiyor ama tenant
 * axios instance üzerinden gidiyor (header zarar vermiyor).
 */
export function useCurrentExchangeRates() {
  return useQuery<ExchangeRatesResponse>({
    queryKey: ["exchange-rates", "current"],
    queryFn: async () => {
      const { data } = await api.get<ExchangeRatesResponse>(
        "/exchange-rates/current",
      );
      return data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
