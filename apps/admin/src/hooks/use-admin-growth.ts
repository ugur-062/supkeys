"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

/** Büyüme ölçümü (API `GET admin/growth/invites`, 2026-09-27 Faz 4). */
export interface GrowthReport {
  period: { from: string; to: string };
  funnel: { invited: number; emailed: number; emails: number; delivered: number; clicked: number; signedUp: number; quoted: number };
  cancelled: Record<string, number>;
  bySource: Record<string, number>;
  byCountry: Array<{ country: string; invited: number }>;
  byLocale: Array<{ locale: string; invited: number }>;
  health: {
    cap: number;
    braked: null | "complaints" | "bounces";
    sentToday: number;
    sent7d: number;
    complaints7d: number;
    hardBounces7d: number;
    complaintRatePct: number;
    bounceRatePct: number;
  };
  discovery: { runs: Record<string, number>; costUsd: number; candidates: Record<string, number> };
  programs: Record<string, number>;
  optOuts: { email: number; invite: number };
}

export function useGrowthReport(days: number) {
  return useQuery({
    queryKey: ["admin-growth", days],
    queryFn: async () => {
      const { data } = await api.get<GrowthReport>("/admin/growth/invites", { params: { days } });
      return data;
    },
  });
}
