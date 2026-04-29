"use client";

import { api } from "@/lib/api";
import type {
  EmailLog,
  EmailLogList,
  ListEmailLogsParams,
} from "@/lib/email-logs/types";
import { useQuery } from "@tanstack/react-query";

const KEYS = {
  all: ["admin", "email-logs"] as const,
  list: (params: ListEmailLogsParams) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

function buildParams(params: ListEmailLogsParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.template) p.template = params.template;
  if (params.toEmail) p.toEmail = params.toEmail;
  if (params.contextType) p.contextType = params.contextType;
  if (params.contextId) p.contextId = params.contextId;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

export function useEmailLogs(params: ListEmailLogsParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<EmailLogList>("/admin/email-logs", {
        params: buildParams(params),
      });
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: 5000, // logs canlı görünmeli, 5sn'de bir refresh
  });
}

export function useEmailLogDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<EmailLog>(`/admin/email-logs/${id}`);
      return data;
    },
    enabled: !!id,
  });
}
