"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AdminSystemStatus {
  database: "up" | "down";
  bootAt: string;
  exchangeRates: {
    latestRateDate: string | null;
    stale: boolean;
    rates: Record<string, number> | null;
  };
  crons: {
    key: string;
    label: string;
    schedule: string;
    lastRunAt: string | null;
    lastStatus: "ok" | "error" | null;
    lastError: string | null;
    runCount: number;
  }[];
  timestamp: string;
}

export function useAdminSystem() {
  return useQuery({
    queryKey: ["admin-system"],
    queryFn: async () => {
      const { data } = await api.get<AdminSystemStatus>("/admin/system");
      return data;
    },
    refetchInterval: 30_000,
  });
}

/** "Kurları şimdi yenile" — TCMB'den elle tetiklenen fetch. */
export function useRefreshRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        success: boolean;
        date?: string;
        reason?: string;
      }>("/admin/system/refresh-rates");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-system"] }),
  });
}

export interface StorageHealth {
  bucket: string;
  envPrefix: string;
  cors: unknown[];
}

/** R2 bucket CORS debug (V2-2 endpoint'i — UI'sı ilk kez burada). */
export function useStorageHealth() {
  return useQuery({
    queryKey: ["admin-storage-health"],
    queryFn: async () => {
      const { data } = await api.get<StorageHealth>("/health/storage");
      return data;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
