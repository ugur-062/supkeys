"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

/** Faz O — firma-yüzü aktivite logu (Silver+, K+Y; sanitize edilmiş satırlar). */
export interface ActivityLogRow {
  id: string;
  action: string;
  actorEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityLogResponse {
  items: ActivityLogRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export function useActivityLog(page: number, module?: string) {
  return useQuery({
    queryKey: ["company-activity-log", page, module ?? ""],
    queryFn: async () => {
      const { data } = await companyApi.get<ActivityLogResponse>(
        "/company/activity-log",
        { params: { page, pageSize: 25, ...(module ? { module } : {}) } },
      );
      return data;
    },
    placeholderData: (prev) => prev,
  });
}
