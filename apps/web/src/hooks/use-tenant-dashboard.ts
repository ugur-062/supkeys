"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { IhaleTabData } from "@/app/dashboard/_components/ihale-tab";
import type { TasarrufTabData } from "@/app/dashboard/_components/tasarruf-tab";
import type { TedarikciTabData } from "@/app/dashboard/_components/tedarikci-tab";

// V2-6 — Dashboard tab endpoint'leri (real data, mock yerine)
export function useTenantDashboardIhale() {
  return useQuery<IhaleTabData>({
    queryKey: ["tenant-dashboard", "ihale"],
    queryFn: () =>
      api.get("/tenants/me/dashboard/ihale").then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useTenantDashboardTasarruf() {
  return useQuery<TasarrufTabData>({
    queryKey: ["tenant-dashboard", "tasarruf"],
    queryFn: () =>
      api.get("/tenants/me/dashboard/tasarruf").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useTenantDashboardTedarikci() {
  return useQuery<TedarikciTabData>({
    queryKey: ["tenant-dashboard", "tedarikci"],
    queryFn: () =>
      api.get("/tenants/me/dashboard/tedarikci").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export interface TenantDashboardStats {
  tenders: {
    active: number;
    draft: number;
    inAward: number;
    awarded: number;
  };
  suppliers: { active: number };
  orders: { pending: number };
  last30Days: {
    completedTenders: number;
    totalSpend: number;
    bidsReceived: number;
  };
}

export type TenantActivity =
  | {
      type: "tender";
      timestamp: string;
      data: {
        id: string;
        tenderNumber: string;
        title: string;
        status: string;
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
        supplier: { id: string; companyName: string };
        tender: { id: string; tenderNumber: string; title: string };
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
        supplier: { id: string; companyName: string };
        tender: { id: string; tenderNumber: string };
      };
    };

const KEYS = {
  stats: ["tenant", "dashboard", "stats"] as const,
  recentActivity: (limit: number) =>
    ["tenant", "dashboard", "recent-activity", limit] as const,
};

export function useTenantDashboardStats() {
  return useQuery({
    queryKey: KEYS.stats,
    queryFn: async () => {
      const { data } = await api.get<TenantDashboardStats>(
        "/tenants/me/dashboard/stats",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useTenantRecentActivity(limit = 10) {
  return useQuery({
    queryKey: KEYS.recentActivity(limit),
    queryFn: async () => {
      const { data } = await api.get<TenantActivity[]>(
        `/tenants/me/dashboard/recent-activity`,
        { params: { limit } },
      );
      return data;
    },
    staleTime: 30_000,
  });
}
