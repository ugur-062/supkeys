"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface OverviewStats {
  tenants: {
    total: number;
    newThisMonth: number;
    newLastMonth: number;
    deltaPercent: number;
    activeThisMonth: number;
  };
  suppliers: {
    total: number;
    newThisMonth: number;
    newLastMonth: number;
    deltaPercent: number;
    activeThisMonth: number;
  };
  tenders: {
    total: number;
    openForBids: number;
    awarded: number;
    thisMonth: number;
    lastMonth: number;
    deltaPercent: number;
  };
  orders: {
    total: number;
    pending: number;
    inDelivery: number;
    completedThisMonth: number;
    completedLastMonth: number;
    deltaPercent: number;
  };
  approvalRequests: {
    totalPending: number;
    staleOver3Days: number;
  };
  emails: {
    sentLast24h: number;
    failedLast24h: number;
    failureRate: number;
    /** V2-1 — Resend webhook breakdown */
    deliveredLast24h: number;
    openedLast24h: number;
    bouncedLast24h: number;
  };
}

export interface RecentActivity {
  recentTenders: Array<{
    id: string;
    tenderNumber: string;
    title: string;
    status: string;
    createdAt: string;
    tenant: { id: string; name: string };
    createdBy: { firstName: string; lastName: string };
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    currency: string;
    createdAt: string;
    tenant: { id: string; name: string };
    supplier: { id: string; companyName: string };
  }>;
  recentRegistrations: Array<{
    id: string;
    name: string;
    taxNumber: string | null;
    createdAt: string;
    users: Array<{ firstName: string; lastName: string; email: string }>;
  }>;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin", "stats", "overview"],
    queryFn: async () => {
      const { data } = await api.get<OverviewStats>("/admin/stats/overview");
      return data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useAdminRecentActivity(limit = 10) {
  return useQuery({
    queryKey: ["admin", "stats", "recent-activity", limit],
    queryFn: async () => {
      const { data } = await api.get<RecentActivity>(
        `/admin/stats/recent-activity?limit=${limit}`,
      );
      return data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useAdminTenderTrend(days = 30) {
  return useQuery({
    queryKey: ["admin", "stats", "tender-trend", days],
    queryFn: async () => {
      const { data } = await api.get<TrendPoint[]>(
        `/admin/stats/tender-trend?days=${days}`,
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
