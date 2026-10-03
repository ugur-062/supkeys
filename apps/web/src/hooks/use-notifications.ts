"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

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

/** Query anahtarı — LiveToasts ile PAYLAŞILIR (perf turu, P10). */
export const NOTIFICATION_KEY = ["company-notifications"] as const;

/** Bildirim listesi — AKTİF portal (+ ortak). */
export function useNotifications(portal?: NotificationPortal, enabled = true) {
  const user = useCompanyAuthStore((s) => s.user);
  return useQuery({
    queryKey: [...NOTIFICATION_KEY, "list", portal ?? "all"],
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

/** Bildirimler sayfasının bir seferde çektiği satır sayısı (API varsayılanıyla aynı). */
export const NOTIFICATION_PAGE_SIZE = 30;

/** Sayfalama imleci — API `parseBefore` biçimi: `<ISO tarih>_<id>`. */
export function notificationCursor(n: Pick<AppNotification, "createdAt" | "id">): string {
  return `${n.createdAt}_${n.id}`;
}

/**
 * Bildirimler sayfası — TÜM geçmiş, imleçle sayfa sayfa (derin denetim S057).
 * Sayfa eskiden `useNotifications` ile yalnız son 30 satırı görüyordu; API'nin
 * `before` imleci hiç kullanılmadığından 31. satır ve öncesine ulaşılamıyordu.
 * Anahtar NOTIFICATION_KEY altında: okundu işaretleme tazelemesi burayı da kapsar.
 */
export function useNotificationFeed(enabled = true) {
  const user = useCompanyAuthStore((s) => s.user);
  return useInfiniteQuery({
    queryKey: [...NOTIFICATION_KEY, "feed"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data } = await companyApi.get<AppNotification[]>("/notifications", {
        params: {
          take: NOTIFICATION_PAGE_SIZE,
          ...(pageParam ? { before: pageParam } : {}),
        },
      });
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.length < NOTIFICATION_PAGE_SIZE
        ? undefined
        : notificationCursor(lastPage[lastPage.length - 1]),
    enabled: !!user && enabled,
    staleTime: 30 * 1000,
  });
}

/** Okunmamış sayısı — zil rozeti (aktif portal + ortak). Periyodik yenilenir. */
export function useUnreadCount(portal?: NotificationPortal) {
  const user = useCompanyAuthStore((s) => s.user);
  return useQuery({
    queryKey: [...NOTIFICATION_KEY, "unread", portal ?? "all"],
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
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_KEY }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_KEY }),
  });
}
