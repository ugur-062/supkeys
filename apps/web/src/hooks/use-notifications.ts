"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
  listingId: string | null;
  readAt: string | null;
  createdAt: string;
}

const KEY = ["company-notifications"] as const;

/** Bildirim listesi (en yeni önce). */
export function useNotifications(enabled = true) {
  const token = useCompanyAuthStore((s) => s.token);
  return useQuery({
    queryKey: [...KEY, "list"],
    queryFn: async () => {
      const { data } = await companyApi.get<AppNotification[]>("/notifications");
      return data;
    },
    enabled: !!token && enabled,
    staleTime: 30 * 1000,
  });
}

/** Okunmamış sayısı — zil rozeti. Periyodik yenilenir. */
export function useUnreadCount() {
  const token = useCompanyAuthStore((s) => s.token);
  return useQuery({
    queryKey: [...KEY, "unread"],
    queryFn: async () => {
      const { data } = await companyApi.get<{ count: number }>(
        "/notifications/unread-count",
      );
      return data.count;
    },
    enabled: !!token,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await companyApi.post<{ updated: number }>(
        "/notifications/read",
        { ids },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{ updated: number }>(
        "/notifications/read-all",
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
