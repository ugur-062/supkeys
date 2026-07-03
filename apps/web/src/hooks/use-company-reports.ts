"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export type ReportType = "ALIM" | "SATIS";

export interface GeneralReport {
  total: number;
  byStatus: Record<string, number>;
  awardedCount: number;
  totalEstimated: number;
  totalAwarded: number;
  /** ALIM: rekabet tasarrufu; SATIS: rekabet kazancı (TRY). */
  totalCompetitionDelta: number;
  avgBidsPerListing: number;
  totalInvites: number;
  totalBids: number;
}

export interface SavingsRow {
  id: string;
  number: string | null;
  title: string;
  awardedAt: string | null;
  /** ALIM: en yüksek teklif; SATIS: en düşük teklif (TRY). */
  reference: number;
  winning: number;
  bidCount: number;
  delta: number;
  deltaPct: number;
  /** SATIS: kazanan − taban. */
  overFloor: number | null;
}

export interface SavingsReport {
  rows: SavingsRow[];
  grandDelta: number;
  grandWinning: number;
  best: { title: string; deltaPct: number } | null;
  worst: { title: string; deltaPct: number } | null;
}

export interface MonthlyRow {
  month: string; // YYYY-MM
  created: number;
  awarded: number;
  awardedTry: number;
}

export interface CounterpartyRow {
  companyId: string;
  name: string;
  orderCount: number;
  totals: Record<string, number>; // para birimi → toplam
}

export interface OrdersSummary {
  total: number;
  byStatus: Record<string, number>;
  totals: Record<string, number>;
}

export interface ListingReport {
  id: string;
  number: string | null;
  title: string;
  type: ReportType;
  status: string;
  format: string | null;
  currency: string;
  createdAt: string;
  publishedAt: string | null;
  closesAt: string | null;
  awardedAt: string | null;
  participation: {
    invited: number;
    bidders: number;
    invitedBidders: number;
    totalBids: number;
    buyNowUsed: boolean;
  };
  bidStats: {
    min: number | null;
    max: number | null;
    avg: number | null;
    winning: number | null;
    delta: number | null;
  };
  items: {
    id: string;
    name: string;
    quantity: string;
    unit: string;
    offerCount: number;
    bestUnitPrice: number | null;
    winningUnitPrice: number | null;
  }[];
  orders: {
    id: string;
    number: string | null;
    status: string;
    amount: string;
    currency: string;
  }[];
}

function reportQuery<T>(
  path: string,
  type: ReportType,
  days: number | null,
) {
  return {
    queryKey: ["company-reports", path, type, days],
    queryFn: async (): Promise<T> => {
      const { data } = await companyApi.get<T>(`/company/reports/${path}`, {
        params: { type, ...(days ? { days } : {}) },
      });
      return data;
    },
  };
}

export function useGeneralReport(type: ReportType, days: number | null) {
  return useQuery(reportQuery<GeneralReport>("general", type, days));
}

export function useSavingsReport(type: ReportType, days: number | null) {
  return useQuery(reportQuery<SavingsReport>("savings", type, days));
}

export function useMonthlyReport(type: ReportType, days: number | null) {
  return useQuery(reportQuery<MonthlyRow[]>("monthly", type, days));
}

export function useCounterpartiesReport(
  type: ReportType,
  days: number | null,
) {
  return useQuery(
    reportQuery<CounterpartyRow[]>("counterparties", type, days),
  );
}

export function useOrdersSummaryReport(
  type: ReportType,
  days: number | null,
) {
  return useQuery(reportQuery<OrdersSummary>("orders-summary", type, days));
}

export function useListingReport(listingId: string) {
  return useQuery({
    queryKey: ["company-reports", "listing", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data } = await companyApi.get<ListingReport>(
        `/company/reports/listing/${listingId}`,
      );
      return data;
    },
  });
}
