"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation } from "@tanstack/react-query";

export type ReportType = "ALIM" | "SATIS";

/* ── Genel rapor ── */

export interface GeneralPayload {
  type: ReportType;
  mode: "SINGLE" | "RANGE";
  listingId?: string;
  rangeStart?: string;
  rangeEnd?: string;
  format?: string;
  status?: string;
  currency?: string;
}

export interface GeneralRow {
  id: string;
  number: string | null;
  title: string;
  format: string | null;
  status: string;
  currency: string;
  round: number;
  closesAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  invitedCount: number;
  submittedBidCount: number;
  responseRate: number | null;
  estimatedTotal: number | null;
  highestTotal: number | null;
  lowestTotal: number | null;
  winningTotal: number | null;
  winnerName: string | null;
  delta: number | null;
}

export interface GeneralResult {
  mode: "SINGLE" | "RANGE";
  type: ReportType;
  generatedAt: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  /** Sunucu tavanına dayanıldı mı (sessiz kesme yok) — Dalga B-2. */
  truncated?: boolean;
  maxRows?: number;
  listings: GeneralRow[];
  summary: {
    totalListings: number;
    awardedListings: number;
    cancelledListings: number;
    statusBreakdown: Record<string, number>;
    totalInvited: number;
    totalSubmittedBids: number;
    overallResponseRate: number;
    avgBidsPerListing: number;
    totalEstimated: number;
    totalAwardedValue: number;
    totalDelta: number;
  };
}

/* ── Tasarruf / kazanç raporu ── */

export interface SavingsPayload {
  type: ReportType;
  rangeStart: string;
  rangeEnd: string;
  currency?: string;
}

export interface SavingsItemRow {
  name: string;
  unit: string;
  quantity: number;
  awardedQuantity: number | null;
  referenceUnitPrice: number | null;
  winningUnitPrice: number | null;
  winnerName: string | null;
  itemReference: number | null;
  itemActual: number | null;
  delta: number | null;
}

export interface SavingsRow {
  id: string;
  number: string | null;
  title: string;
  currency: string;
  bidCount: number;
  highestBid: number | null;
  lowestBid: number | null;
  winningTotal: number | null;
  delta: number | null;
  deltaPct: number | null;
  targetTotal: number;
  actualTotal: number;
  winners: { name: string; total: number }[];
  items: SavingsItemRow[];
  awardedAt: string | null;
}

export interface SavingsResult {
  type: ReportType;
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  currency: string | null;
  truncated?: boolean;
  maxRows?: number;
  rows: SavingsRow[];
  summary: {
    totalListings: number;
    grandHighest: number;
    grandLowest: number;
    grandTarget: number;
    grandActual: number;
    grandDelta: number;
    grandDeltaPct: number;
    avgDeltaPct: number;
    best: { number: string | null; title: string; deltaPct: number | null } | null;
    worst: { number: string | null; title: string; deltaPct: number | null } | null;
    byParty: { name: string; awarded: number }[];
  };
}

/* ── Teklif karşılaştırma ── */

export interface BidComparisonPayload {
  type: ReportType;
  listingId: string;
  criteria: "PRICE" | "ANSWERS" | "BOTH";
  includeNonBidders?: boolean;
  showBidCurrencies?: boolean;
  includeRoundHistory?: boolean;
}

export interface ComparisonParty {
  companyId: string;
  companyName: string;
  submitted: boolean;
  status: string;
  isBuyNow: boolean;
  totalAmount: number | null;
  totalTry: number | null;
  bidCurrency: string | null;
  rank: number | null;
  deltaVsReference: number | null;
  itemPrices: {
    itemId: string;
    unitPrice: number | null;
    totalPrice: number | null;
    isBest: boolean;
    deltaVsReferencePct: number | null;
  }[];
  itemAnswers: { itemId: string; answer: string | null }[];
}

export interface BidComparisonResult {
  type: ReportType;
  generatedAt: string;
  includePrice: boolean;
  includeAnswers: boolean;
  includeNonBidders: boolean;
  showBidCurrencies: boolean;
  listing: {
    id: string;
    number: string | null;
    title: string;
    currency: string;
    round: number;
    referenceTotal: number;
  };
  items: {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    referenceUnitPrice: number | null;
    bestUnitPrice: number | null;
    bestCompanyId: string | null;
  }[];
  parties: ComparisonParty[];
  recommendedAwards: {
    itemId: string;
    itemName: string;
    companyName: string;
    unitPrice: number;
  }[];
  roundHistory: { round: number; bidderName: string; amount: number }[];
}

/* ── Mutations ── */

export function useGeneralReport() {
  return useMutation({
    mutationFn: async (payload: GeneralPayload) => {
      const { data } = await companyApi.post<GeneralResult>(
        "/company/reports/general",
        payload,
      );
      return data;
    },
  });
}

export function useSavingsReport() {
  return useMutation({
    mutationFn: async (payload: SavingsPayload) => {
      const { data } = await companyApi.post<SavingsResult>(
        "/company/reports/savings",
        payload,
      );
      return data;
    },
  });
}

export function useBidComparisonReport() {
  return useMutation({
    mutationFn: async (payload: BidComparisonPayload) => {
      const { data } = await companyApi.post<BidComparisonResult>(
        "/company/reports/bid-comparison",
        payload,
      );
      return data;
    },
  });
}

/** xlsx indirir (blob) — dosya adı Content-Disposition'dan. */
async function downloadXlsx(path: string, payload: unknown, fallback: string) {
  const res = await companyApi.post(path, payload, { responseType: "blob" });
  const dispo = String(res.headers["content-disposition"] ?? "");
  const match = /filename="?([^";]+)"?/.exec(dispo);
  const filename = match?.[1] ?? fallback;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { filename };
}

export function useDownloadGeneralReport() {
  return useMutation({
    mutationFn: (payload: GeneralPayload) =>
      downloadXlsx("/company/reports/general/download", payload, "rapor.xlsx"),
  });
}

export function useDownloadSavingsReport() {
  return useMutation({
    mutationFn: (payload: SavingsPayload) =>
      downloadXlsx("/company/reports/savings/download", payload, "rapor.xlsx"),
  });
}

export function useDownloadBidComparisonReport() {
  return useMutation({
    mutationFn: (payload: BidComparisonPayload) =>
      downloadXlsx(
        "/company/reports/bid-comparison/download",
        payload,
        "rapor.xlsx",
      ),
  });
}
