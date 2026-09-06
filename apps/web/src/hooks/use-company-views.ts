"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export type ViewDays = 7 | 30 | 90;

export interface VisitorItem {
  company: {
    id: string;
    rothernId: string | null;
    name: string;
    slug: string | null;
    city: string | null;
    activities: string[];
    verified: boolean;
    logoUrl: string | null;
  };
  visits: number;
  lastViewedAt: string;
  profileViews: number;
  products: { id: string; name: string; slug: string | null }[];
  connected: boolean;
}

export interface VisitorsResponse {
  days: number;
  total: number;
  profileViews: number;
  productViews: number;
  identified: number;
  anonymous: number;
  /** Önceki dönem (aynı uzunlukta) — eğilim rozeti. */
  previous: { total: number; identified: number };
  /** Gün başına görüntülenme, eskiden yeniye (dönemdeki her gün). */
  daily: { date: string; views: number }[];
  /** Standart paket: kimlikli liste kilitli (sayılar açık). */
  locked: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  items: VisitorItem[];
}

export interface InsightsResponse {
  days: number;
  generatedAt: string;
  /** Gün başına profil/ürün görüntülenmesi, eskiden yeniye. */
  series: { date: string; profile: number; product: number }[];
  views: {
    profile: { current: number; previous: number };
    product: { current: number; previous: number };
    identifiedVisitors: { current: number; previous: number };
  };
  topProducts: { id: string; name: string; slug: string | null; views: number }[];
  viewerCities: { city: string; count: number }[];
  inquiries: { received: number; replied: number; medianFirstReplyHours: number | null };
  connections: { invitesReceived: number; accepted: number };
  listingInvitations: number;
  bids: { submitted: number; won: number };
}

/** Ziyaret Edenler — `GET company/views/visitors` (sayılar herkese, liste Silver+). */
export function useVisitors(days: ViewDays, page = 1, enabled = true) {
  return useQuery<VisitorsResponse>({
    queryKey: ["company-views", "visitors", days, page],
    queryFn: async () => {
      const { data } = await companyApi.get<VisitorsResponse>(`/company/views/visitors?days=${days}&page=${page}`);
      return data;
    },
    enabled,
    staleTime: 60_000,
  });
}

/** İş Analizi — `GET company/views/insights` (Silver+). */
export function useInsights(days: ViewDays, enabled = true) {
  return useQuery<InsightsResponse>({
    queryKey: ["company-views", "insights", days],
    queryFn: async () => {
      const { data } = await companyApi.get<InsightsResponse>(`/company/views/insights?days=${days}`);
      return data;
    },
    enabled,
    staleTime: 60_000,
  });
}
