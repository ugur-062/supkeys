"use client";

import type { TasarrufTabData } from "@/components/dashboard/tasarruf-tab";
import type { TedarikciTabData } from "@/components/dashboard/tedarikci-tab";
import { companyApi } from "@/lib/company-auth/api";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

// ── Aksiyon Merkezi (Faz 2) — severity + zaman bilgili tek uyarı listesi ──

export type ActionSeverity = "critical" | "warning" | "info";

export interface ActionCenterApiRow {
  key: string;
  severity: ActionSeverity;
  count: number;
  /** En yakın gelecekteki son tarih (ISO). */
  dueAt: string | null;
  /** En büyük gecikme (gün). */
  overdueDays: number | null;
  /** En eski bekleme (gün). */
  waitingDays: number | null;
}

export function useActionCenter(portal: "satinalma" | "satis") {
  return useQuery<{ rows: ActionCenterApiRow[] }>({
    queryKey: ["company-dashboard", "action-center", portal],
    queryFn: async () => {
      const { data } = await companyApi.get<{ rows: ActionCenterApiRow[] }>(
        `/company/dashboard/action-center?portal=${portal}`,
      );
      return data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export interface OpenTenderRow {
  id: string;
  tenderNumber: string;
  title: string;
  openedAt: string;
  closesAt: string;
  /** Gelen SUBMITTED teklif sayısı (pano tablosu kolonu). */
  bidCount?: number;
}

export interface SatinalmaDashboard {
  openCount: number;
  bidsReceived: number;
  awarded: number;
  ongoingOrders: number;
  /** Davet edilip teklif verilmemiş açık SATIŞ ihalesi sayısı (anasayfa uyarısı). */
  invitedPending: number;
  openTendersOwn: OpenTenderRow[];
  openTendersCompany: OpenTenderRow[];
}

export function useSatinalmaDashboard() {
  return useQuery<SatinalmaDashboard>({
    queryKey: ["company-dashboard", "satinalma"],
    queryFn: async () => {
      const { data } = await companyApi.get<SatinalmaDashboard>(
        "/company/dashboard/satinalma",
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useSatinalmaTasarruf() {
  return useQuery<TasarrufTabData>({
    queryKey: ["company-dashboard", "satinalma", "tasarruf"],
    queryFn: async () => {
      const { data } = await companyApi.get<TasarrufTabData>(
        "/company/dashboard/satinalma/tasarruf",
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSatinalmaTedarikci() {
  return useQuery<TedarikciTabData>({
    queryKey: ["company-dashboard", "satinalma", "tedarikci"],
    queryFn: async () => {
      const { data } = await companyApi.get<TedarikciTabData>(
        "/company/dashboard/satinalma/tedarikci",
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

// ── Satış panosu — eski tedarikçi paneli paritesi (stats + aktivite) ──

export interface SatisStats {
  invitations: { active: number };
  bids: { active: number };
  wonTenders: number;
  orders: { pending: number };
  revenue: { total: number; last30: number; prev30: number };
  last30Days: { bidsSubmitted: number; prevBidsSubmitted: number };
  buyers: { active: number };
}

export interface SatisActivityRow {
  type: "invitation" | "bid" | "order";
  title: string;
  subtitle: string;
  at: string;
  href: string;
}

export function useSatisStats() {
  return useQuery<SatisStats>({
    queryKey: ["company-dashboard", "satis", "stats"],
    queryFn: async () => {
      const { data } = await companyApi.get<SatisStats>(
        "/company/dashboard/satis/stats",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export interface SatisActivityPage {
  rows: SatisActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function useSatisActivity(limit = 8, page = 1) {
  return useQuery<SatisActivityPage>({
    queryKey: ["company-dashboard", "satis", "aktivite", limit, page],
    queryFn: async () => {
      const { data } = await companyApi.get<SatisActivityPage>(
        `/company/dashboard/satis/aktivite?limit=${limit}&page=${page}`,
      );
      return data;
    },
    // Sayfa geçişinde önceki sayfa görünür kalsın (liste zıplamasın).
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export type SavingsPeriod = "month" | "quarter" | "year";

export interface TimeSavingsBreakdownRow {
  key: string;
  label: string;
  minutes: number;
}

export interface TimeSavingsData {
  savedMinutes: number;
  estimatedMailMinutes: number;
  systemMinutes: number;
  laborValueTry: number | null;
  counters: {
    listings: number;
    invitations: number;
    bids: number;
    avgItemsPerBid: number;
    revisionRounds: number;
    approvals: number;
    orders: number;
  };
  breakdown: TimeSavingsBreakdownRow[];
  measured: {
    inviteToFirstBidHours: number | null;
    closeToAwardHours: number | null;
    awardToOrderHours: number | null;
  };
  months: { key: string; minutes: number }[];
  params: Record<string, number | null>;
}

/** Zaman Tasarrufu — panel şeridi + Zaman bölümü için TEK toplu istek. */
export function useTimeSavings(period: SavingsPeriod) {
  return useQuery({
    queryKey: ["company-dashboard", "time-savings", period],
    queryFn: async () => {
      const { data } = await companyApi.get<TimeSavingsData>(
        "/company/dashboard/time-savings",
        { params: { period } },
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

// ── Pano analitiği (yeniden tasarım) — panel başına TEK toplu yanıt ──

export interface AnalyticsMonthPoint {
  key: string;
  label: string;
  value: number;
}

export interface SatinalmaAnalytics {
  actions: {
    closingSoon: number;
    awaitingDecision: number;
    pendingApprovals: number;
    overdueDeliveries: number;
    pendingPayments: number;
  };
  funnel: { key: string; label: string; count: number }[];
  cycleTrend: { key: string; label: string; value: number | null }[];
  savingsTrend: (AnalyticsMonthPoint & { cumulative: number })[];
  categorySavings: { label: string; amount: number; percent: number }[];
  topSavings: { number: string; title: string; amount: number }[];
  competition: {
    avgBidsPerListing: number;
    lowCompetition: {
      id: string;
      number: string;
      title: string;
      bidCount: number;
      closesAt: string | null;
    }[];
  };
  suppliers: {
    name: string;
    bids: number;
    winRatePct: number | null;
    avgResponseHours: number | null;
  }[];
  cashCalendar: { label: string; amount: number }[];
  kpiSeries: Record<
    "listings" | "bids" | "awarded" | "orders",
    AnalyticsMonthPoint[]
  >;
  deltas: Record<
    "listings" | "bids" | "awarded" | "orders",
    number | null
  >;
}

export interface SatisAnalytics {
  actions: {
    unansweredInvites: number;
    closingSoonInvites: number;
    overdueDeliveries: number;
  };
  revenueTrend: (AnalyticsMonthPoint & { cumulative: number })[];
  winLoss: { key: string; label: string; won: number; lost: number; pending: number }[];
  pipeline: {
    key: string;
    label: string;
    count: number;
    amountTry: number | null;
  }[];
  pareto: {
    rows: { name: string; amount: number; sharePct: number }[];
    totalTry: number;
    concentrationWarning: boolean;
  };
  responseTrend: { key: string; label: string; value: number | null }[];
  categoryWinRate: { label: string; winPct: number; decided: number }[];
  missed: { count: number; amountTry: number | null };
  kpiSeries: Record<
    "bidsSubmitted" | "won" | "orders" | "revenue",
    AnalyticsMonthPoint[]
  >;
  deltas: Record<"bidsSubmitted" | "orders" | "revenue", number | null>;
}

export function useSatinalmaAnalytics(period: SavingsPeriod) {
  return useQuery({
    queryKey: ["company-dashboard", "satinalma-analytics", period],
    queryFn: async () => {
      const { data } = await companyApi.get<SatinalmaAnalytics>(
        "/company/dashboard/satinalma/analytics",
        { params: { period } },
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSatisAnalytics(period: SavingsPeriod) {
  return useQuery({
    queryKey: ["company-dashboard", "satis-analytics", period],
    queryFn: async () => {
      const { data } = await companyApi.get<SatisAnalytics>(
        "/company/dashboard/satis/analytics",
        { params: { period } },
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
