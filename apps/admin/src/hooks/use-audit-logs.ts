"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface AuditLogItem {
  id: string;
  tenantId: string | null;
  actorType: "tenant" | "admin" | "supplier" | "system";
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogResponse {
  items: AuditLogItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditLogParams {
  actorType?: string;
  action?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useAuditLogs(params: AuditLogParams = {}) {
  const qs = new URLSearchParams();
  if (params.actorType) qs.set("actorType", params.actorType);
  if (params.action) qs.set("action", params.action);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const q = qs.toString();

  return useQuery({
    queryKey: ["admin", "audit-logs", params],
    queryFn: async () => {
      const { data } = await api.get<AuditLogResponse>(
        `/admin/audit-logs${q ? `?${q}` : ""}`,
      );
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}
