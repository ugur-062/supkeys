"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type NotificationPortal = "satinalma" | "satis";

export interface AppNotification {
  id: string;
  type: string;
  portal: NotificationPortal | null;
  title: string;
  body: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
  listingId: string | null;
  readAt: string | null;
  createdAt: string;
}

const KEY = ["company-notifications"] as const;

/** Bildirim listesi — AKTİF portal (+ ortak). */
export function useNotifications(portal?: NotificationPortal, enabled = true) {
  const user = useCompanyAuthStore((s) => s.user);
  return useQuery({
    queryKey: [...KEY, "list", portal ?? "all"],
    queryFn: async () => {
      const { data } = await companyApi.get<AppNotification[]>("/notifications", {
        params: portal ? { portal } : undefined,
      });
      return data;
    },
    enabled: !!user && enabled,
    staleTime: 30 * 1000,
  });
}

/** Okunmamış sayısı — zil rozeti (aktif portal + ortak). Periyodik yenilenir. */
export function useUnreadCount(portal?: NotificationPortal) {
  const user = useCompanyAuthStore((s) => s.user);
  return useQuery({
    queryKey: [...KEY, "unread", portal ?? "all"],
    queryFn: async () => {
      const { data } = await companyApi.get<{ count: number }>(
        "/notifications/unread-count",
        { params: portal ? { portal } : undefined },
      );
      return data.count;
    },
    enabled: !!user,
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

/** Tümünü okundu — verilen portal (+ ortak) kapsamında. */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (portal?: NotificationPortal) => {
      const { data } = await companyApi.post<{ updated: number }>(
        "/notifications/read-all",
        undefined,
        { params: portal ? { portal } : undefined },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
