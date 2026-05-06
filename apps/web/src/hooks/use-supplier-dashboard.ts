"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import { useQuery } from "@tanstack/react-query";

export interface SupplierDashboardStats {
  invitations: { active: number };
  bids: { active: number };
  wonTenders: number;
  orders: { pending: number };
  revenue: { total: number };
  last30Days: { bidsSubmitted: number };
  buyers: { active: number };
}

export type SupplierActivity =
  | {
      type: "invitation";
      timestamp: string;
      data: {
        id: string;
        status: string;
        tender: {
          id: string;
          tenderNumber: string;
          title: string;
          bidsCloseAt: string;
          status: string;
        };
      };
    }
  | {
      type: "bid";
      timestamp: string;
      data: {
        id: string;
        status: string;
        totalAmount: string;
        currency: string;
        version: number;
        tender: {
          id: string;
          tenderNumber: string;
          title: string;
          status: string;
        };
      };
    }
  | {
      type: "order";
      timestamp: string;
      data: {
        id: string;
        orderNumber: string;
        status: string;
        totalAmount: string;
        currency: string;
        tenant: { id: string; name: string };
        tender: { id: string; tenderNumber: string };
      };
    };

const KEYS = {
  stats: ["supplier", "dashboard", "stats"] as const,
  recentActivity: (limit: number) =>
    ["supplier", "dashboard", "recent-activity", limit] as const,
};

export function useSupplierDashboardStats() {
  return useQuery({
    queryKey: KEYS.stats,
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierDashboardStats>(
        "/supplier/dashboard/stats",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useSupplierRecentActivity(limit = 10) {
  return useQuery({
    queryKey: KEYS.recentActivity(limit),
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierActivity[]>(
        `/supplier/dashboard/recent-activity`,
        { params: { limit } },
      );
      return data;
    },
    staleTime: 30_000,
  });
}
