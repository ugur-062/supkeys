"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export interface GeneralReport {
  total: number;
  byStatus: Record<string, number>;
  awardedCount: number;
  totalEstimated: number;
  totalAwarded: number;
  totalSavings: number;
}

export interface SavingsRow {
  id: string;
  number: string | null;
  title: string;
  awardedAt: string | null;
  estimated: number;
  highest: number;
  winning: number;
  bidCount: number;
  savings: number;
  savingsPct: number;
}

export interface SavingsReport {
  rows: SavingsRow[];
  grandSavings: number;
  grandWinning: number;
  best: { title: string; savingsPct: number } | null;
  worst: { title: string; savingsPct: number } | null;
}

export function useGeneralReport(days: number | null) {
  return useQuery({
    queryKey: ["company-reports", "general", days],
    queryFn: async () => {
      const { data } = await companyApi.get<GeneralReport>(
        "/company/reports/general",
        { params: days ? { days } : {} },
      );
      return data;
    },
  });
}

export function useSavingsReport(days: number | null) {
  return useQuery({
    queryKey: ["company-reports", "savings", days],
    queryFn: async () => {
      const { data } = await companyApi.get<SavingsReport>(
        "/company/reports/savings",
        { params: days ? { days } : {} },
      );
      return data;
    },
  });
}
