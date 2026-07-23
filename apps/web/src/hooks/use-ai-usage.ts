"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

/**
 * Faz AI-0 — AI kullanım ekranı verisi. Yanıtta YALNIZ yüzde vardır (dolar ve
 * model adı backend'den hiç dönmez). view: Kurucu/Yönetici "company" (firma
 * kırılımı), SA/ST "self" (yalnız kendi tavanına oranla).
 */
export interface AiUsageByUser {
  userId: string;
  userEmail: string | null;
  requests: number;
  percentOfPool: number;
}

export interface AiUsageByFeature {
  feature: string;
  requests: number;
  percentOfPool: number;
}

export interface AiUsageResponse {
  enabled: boolean;
  view: "company" | "self";
  warnAtPercent: number;
  percentUsed: number;
  warning: boolean;
  premiumPercentUsed?: number;
  byUser?: AiUsageByUser[];
  byFeature?: AiUsageByFeature[];
}

export function useAiUsage() {
  return useQuery({
    queryKey: ["company-ai-usage"],
    queryFn: async () => {
      const { data } = await companyApi.get<AiUsageResponse>("/company/ai/usage");
      return data;
    },
    placeholderData: (prev) => prev,
  });
}
